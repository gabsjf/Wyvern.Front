import { ArquivosDoGltfFaltando, converterGltfParaGlb, ehGltf, nomeGlbDoGltf } from './gltf-para-glb';
import { pareceGlb } from '../services/modelos3d.service';

// um triângulo: 3 vértices (36 bytes) e 3 índices (6 bytes, completados até 8)
const POSICOES = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const INDICES = new Uint16Array([0, 1, 2, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function binDoTriangulo(): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(44);
  b.set(new Uint8Array(POSICOES.buffer), 0);
  b.set(new Uint8Array(INDICES.buffer), 36);
  return b;
}

/** Um .gltf com o triângulo num .bin à parte e, se pedido, uma textura também à parte. */
function gltfDoTriangulo(binUri: string, imagemUri?: string): object {
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ uri: binUri, byteLength: 44 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    ...(imagemUri ? { images: [{ uri: imagemUri }] } : {}),
  };
}

/** Separa o .glb em JSON e BIN. */
async function abrir(glb: File): Promise<{ json: any; bin: Uint8Array }> {
  const bytes = new Uint8Array(await glb.arrayBuffer());
  const dv = new DataView(bytes.buffer);
  const tamanhoJson = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + tamanhoJson)));
  const inicioBin = 20 + tamanhoJson;
  const tamanhoBin = inicioBin < bytes.byteLength ? dv.getUint32(inicioBin, true) : 0;
  return { json, bin: bytes.subarray(inicioBin + 8, inicioBin + 8 + tamanhoBin) };
}

describe('gltf para glb', () => {
  it('reconhece .gltf pelo nome e troca a extensão', () => {
    expect(ehGltf('Orc Guerreiro.GLTF')).toBe(true);
    expect(ehGltf('orc.glb')).toBe(false);
    expect(nomeGlbDoGltf('orc.gltf')).toBe('orc.glb');
  });

  it('junta o .gltf, o .bin e a textura num .glb válido', async () => {
    const arquivos = [
      new File([JSON.stringify(gltfDoTriangulo('orc%20corpo.bin', 'texturas/Pele.png'))], 'orc.gltf'),
      new File([binDoTriangulo()], 'orc corpo.bin'),
      new File([PNG], 'pele.PNG'),
      new File(['nada'], 'leia-me.txt'),
    ];

    const glb = await converterGltfParaGlb(arquivos);

    expect(glb.name).toBe('orc.glb');
    const bytes = await glb.arrayBuffer();
    expect(pareceGlb(bytes.slice(0, 12), bytes.byteLength)).toBe(true);
    const { json, bin } = await abrir(glb);
    expect(json.buffers).toEqual([{ byteLength: 52 }]); // 44 do .bin + 8 da textura
    expect(json.images[0]).toEqual({ bufferView: 2, mimeType: 'image/png' });
    expect(json.bufferViews[2]).toEqual({ buffer: 0, byteOffset: 44, byteLength: 8 });
    expect(Array.from(bin.subarray(44, 52))).toEqual(Array.from(PNG));
  });

  it('o .glb abre no leitor do Three.js com a mesma geometria', async () => {
    const glb = await converterGltfParaGlb([
      new File([JSON.stringify(gltfDoTriangulo('t.bin'))], 't.gltf'),
      new File([binDoTriangulo()], 't.bin'),
    ]);
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

    const lido = await new GLTFLoader().parseAsync(await glb.arrayBuffer(), '');

    const malha = lido.scene.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } };
    expect(Array.from(malha.geometry.getAttribute('position').array)).toEqual(Array.from(POSICOES));
  });

  it('aceita o buffer embutido em data: (o "glTF Embedded")', async () => {
    const base64 = btoa(String.fromCharCode(...binDoTriangulo()));
    const glb = await converterGltfParaGlb([new File([JSON.stringify(gltfDoTriangulo(`data:application/octet-stream;base64,${base64}`))], 'e.gltf')]);

    const { json, bin } = await abrir(glb);
    expect(json.buffers).toEqual([{ byteLength: 44 }]);
    expect(Array.from(bin.subarray(0, 44))).toEqual(Array.from(binDoTriangulo()));
  });

  it('diz quais arquivos faltam na seleção', async () => {
    const gltf = new File([JSON.stringify(gltfDoTriangulo('corpo.bin', 'pele.png'))], 'orc.gltf');

    const erro = await converterGltfParaGlb([gltf]).catch(e => e);

    expect(erro).toBeInstanceOf(ArquivosDoGltfFaltando);
    expect(erro.nomes).toEqual(['corpo.bin', 'pele.png']);
  });

  it('recusa glTF 1.0', async () => {
    await expect(converterGltfParaGlb([new File([JSON.stringify({ asset: { version: '1.0' } })], 'velho.gltf')])).rejects.toThrow();
  });
});
