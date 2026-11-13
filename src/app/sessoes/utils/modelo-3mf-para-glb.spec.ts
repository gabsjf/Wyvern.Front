import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { converter3mfParaGlb, eh3mf, nomeGlbDo3mf } from './modelo-3mf-para-glb';
import { pareceGlb } from '../services/modelos3d.service';

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

// um tetraedro de 10 mm de altura no eixo Z (para cima no 3MF)
const VERTICES = `<vertices>
  <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
</vertices>`;

function modelo(unidade: string, comCor: boolean): string {
  const triangulos = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]
    .map(([a, b, c], i) => `<triangle v1="${a}" v2="${b}" v3="${c}"${comCor ? ` pid="1" p1="${i % 2}"` : ''}/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unidade}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    ${comCor ? '<colorgroup id="1"><color color="#FF0000"/><color color="#0000FF"/></colorgroup>' : ''}
    <object id="2" type="model"><mesh>${VERTICES}<triangles>${triangulos}</triangles></mesh></object>
  </resources>
  <build><item objectid="2"/></build>
</model>`;
}

function arquivo3mf(nome: string, unidade = 'millimeter', comCor = true): File {
  const zip = zipSync({ '_rels/.rels': strToU8(RELS), '3D/3dmodel.model': strToU8(modelo(unidade, comCor)) });
  return new File([zip as Uint8Array<ArrayBuffer>], nome);
}

async function lerGlb(glb: File) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { Box3, Vector3 } = await import('three');
  const lido = await new GLTFLoader().parseAsync(await glb.arrayBuffer(), '');
  const malhas: any[] = [];
  lido.scene.traverse((o: any) => o.isMesh && malhas.push(o));
  const medidas = new Box3().setFromObject(lido.scene).getSize(new Vector3());
  return { malhas, medidas };
}

describe('3mf para glb', () => {
  it('reconhece .3mf pelo nome e troca a extensão', () => {
    expect(eh3mf('Orc Guerreiro.3MF')).toBe(true);
    expect(eh3mf('orc.stl')).toBe(false);
    expect(nomeGlbDo3mf('orc.3mf')).toBe('orc.glb');
  });

  it('converte com as cores por triângulo, de pé e em metros', async () => {
    const glb = await converter3mfParaGlb(arquivo3mf('tetra.3mf'));

    expect(glb.name).toBe('tetra.glb');
    const bytes = await glb.arrayBuffer();
    expect(pareceGlb(bytes.slice(0, 12), bytes.byteLength)).toBe(true);
    const { malhas, medidas } = await lerGlb(glb);
    expect(malhas[0].material.vertexColors).toBe(true);
    const cores = Array.from(malhas[0].geometry.getAttribute('color').array as Float32Array);
    expect(cores.slice(0, 3)).toEqual([1, 0, 0]); // vermelho no primeiro triângulo
    // 10 mm de altura viram 0,01 m, e a altura agora é o Y
    expect(medidas.y).toBeCloseTo(0.01, 6);
    expect(medidas.z).toBeCloseTo(0.01, 6);
  });

  it('respeita a unidade do arquivo', async () => {
    const { medidas } = await lerGlb(await converter3mfParaGlb(arquivo3mf('grande.3mf', 'centimeter')));

    expect(medidas.y).toBeCloseTo(0.1, 6);
  });

  it('sem cor, vira o cinza de miniatura', async () => {
    const { malhas } = await lerGlb(await converter3mfParaGlb(arquivo3mf('cinza.3mf', 'millimeter', false)));

    expect(malhas[0].material.color.getHex()).not.toBe(0xffffff);
    expect(malhas[0].material.vertexColors).toBe(false);
  });

  it('recusa um arquivo que não é .3mf', async () => {
    await expect(converter3mfParaGlb(new File(['não sou um zip'], 'falso.3mf'))).rejects.toThrow();
  });
});
