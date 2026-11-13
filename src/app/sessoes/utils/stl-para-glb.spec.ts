import { converterStlParaGlb, ehStl, nomeGlb } from './stl-para-glb';
import { pareceGlb } from '../services/modelos3d.service';

/** .stl binário: 80 bytes de cabeçalho, o número de triângulos e 50 bytes por triângulo (normal, 3 vértices, atributo). */
function stlBinario(triangulos: number[][][]): ArrayBuffer {
  const b = new ArrayBuffer(84 + 50 * triangulos.length);
  const v = new DataView(b);
  v.setUint32(80, triangulos.length, true);
  triangulos.forEach((t, i) => {
    let p = 84 + i * 50 + 12; // pula a normal (o conversor recalcula)
    for (const vertice of t) for (const c of vertice) { v.setFloat32(p, c, true); p += 4; }
  });
  return b;
}

// um tetraedro: 4 triângulos que dividem 4 vértices (no .stl, 12 cópias)
const A = [0, 0, 0], B = [10, 0, 0], C = [0, 10, 0], D = [0, 0, 10];
const TETRAEDRO = [[A, C, B], [A, B, D], [A, D, C], [B, C, D]];

describe('stl para glb (WYV-26)', () => {
  it('reconhece .stl pelo nome e troca a extensão', () => {
    expect(ehStl('Orc Guerreiro.STL')).toBe(true);
    expect(ehStl('orc.glb')).toBe(false);
    expect(nomeGlb('orc_guerreiro.stl')).toBe('orc_guerreiro.glb');
  });

  it('converte um .stl binário num .glb válido', async () => {
    const stl = new File([stlBinario(TETRAEDRO)], 'tetra.stl');

    const glb = await converterStlParaGlb(stl);

    expect(glb.name).toBe('tetra.glb');
    const bytes = await glb.arrayBuffer();
    expect(pareceGlb(bytes.slice(0, 12), bytes.byteLength)).toBe(true);
  });

  it('recusa um .stl sem triângulos', async () => {
    await expect(converterStlParaGlb(new File([stlBinario([])], 'vazio.stl'))).rejects.toThrow();
  });
});
