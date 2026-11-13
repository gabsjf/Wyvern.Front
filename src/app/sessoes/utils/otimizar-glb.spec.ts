import { contarTriangulosGlb, otimizarGlb } from './otimizar-glb';
import { pareceGlb } from '../services/modelos3d.service';

/** Uma esfera com `segmentos`² x 2 triângulos, metade de um material e metade de outro, já como .glb. */
async function esferaGlb(segmentos: number, nome = 'esfera.glb'): Promise<File> {
  const T = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const g = new T.SphereGeometry(1, segmentos, segmentos);
  const metade = Math.floor(g.index!.count / 6) * 3;
  g.addGroup(0, metade, 0);
  g.addGroup(metade, g.index!.count - metade, 1);
  const malha = new T.Mesh(g, [new T.MeshStandardMaterial({ color: 0xff0000 }), new T.MeshStandardMaterial({ color: 0x0000ff })]);
  const glb = (await new GLTFExporter().parseAsync(malha, { binary: true })) as ArrayBuffer;
  return new File([glb], nome, { type: 'model/gltf-binary' });
}

async function abrir(arquivo: File) {
  const T = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(await arquivo.arrayBuffer(), '');
  const malhas: any[] = [];
  gltf.scene.traverse((o: any) => o.isMesh && malhas.push(o));
  return { malhas, medidas: new T.Box3().setFromObject(gltf.scene).getSize(new T.Vector3()) };
}

describe('otimizar glb', () => {
  it('conta os triângulos lendo só o JSON', async () => {
    const glb = await esferaGlb(100);
    // a esfera do Three.js perde os triângulos degenerados dos polos: 2 x 100 x 99
    expect(contarTriangulosGlb(await glb.arrayBuffer())).toBe(19800);
  });

  it('deixa como está um modelo que já é leve', async () => {
    expect(await otimizarGlb(await esferaGlb(20), 5000)).toBeNull();
  });

  it('simplifica até a meta, mantendo a forma, as normais e os dois materiais', async () => {
    const original = await esferaGlb(200, 'bola.glb');

    const r = await otimizarGlb(original, 5000);

    expect(r).not.toBeNull();
    expect(r!.antes).toBe(79600);
    expect(r!.depois).toBeLessThanOrEqual(5000 * 1.25);
    expect(r!.depois).toBeGreaterThan(1000);
    expect(r!.arquivo.name).toBe('bola.glb');
    expect(r!.arquivo.size).toBeLessThan(original.size / 5);
    const bytes = await r!.arquivo.arrayBuffer();
    expect(pareceGlb(bytes.slice(0, 12), bytes.byteLength)).toBe(true);
    expect(contarTriangulosGlb(bytes)).toBe(r!.depois);

    const { malhas, medidas } = await abrir(r!.arquivo);
    const cores = malhas.map(m => m.material.color.getHex()).sort();
    expect(cores).toHaveLength(2); // as duas metades seguem com o material delas
    expect(cores[0]).not.toBe(cores[1]);
    expect(medidas.x).toBeCloseTo(2, 1);
    expect(medidas.y).toBeCloseTo(2, 1);
    for (const m of malhas) expect(m.geometry.getAttribute('normal')).toBeTruthy();
  });

  it('junta triângulos soltos (sem índice, como num .stl) antes de simplificar', async () => {
    const T = await import('three');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const solta = new T.SphereGeometry(1, 150, 150).toNonIndexed();
    const glb = (await new GLTFExporter().parseAsync(new T.Mesh(solta, new T.MeshStandardMaterial()), { binary: true })) as ArrayBuffer;

    const r = await otimizarGlb(new File([glb], 'solta.glb'), 3000);

    expect(r!.depois).toBeLessThanOrEqual(3000 * 1.25);
    const { medidas } = await abrir(r!.arquivo);
    expect(medidas.y).toBeCloseTo(2, 1);
  });
});
