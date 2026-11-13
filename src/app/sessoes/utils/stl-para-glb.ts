/**
 * Converte um .stl (o formato das miniaturas de impressão 3D) num .glb, no navegador, antes de subir. Assim o servidor,
 * o mapa 3D e a prévia continuam lidando só com .glb.
 *
 * - Junta os vértices repetidos (o .stl repete cada vértice em todo triângulo): o arquivo costuma cair pela metade.
 * - Põe de pé: modelos de impressão vêm com o eixo Z para cima; no 3D do Wyvern, "para cima" é o Y.
 * - .stl não tem material: vira um cinza de miniatura sem pintura (ou as cores por face, nos raros que trazem).
 */

/** Acima disso o navegador pode travar convertendo; quem tem um arquivo maior precisa simplificar o modelo antes. */
export const TAMANHO_MAXIMO_STL = 80 * 1024 * 1024;

/** Limite do .stl antes de converter: 80 MB, ou mais se a biblioteca aceitar .glb grandes (o .stl encolhe uns 50% ao converter). */
export function limiteDoStl(limiteDoGlb: number): number {
  return Math.max(TAMANHO_MAXIMO_STL, limiteDoGlb * 3);
}

export function ehStl(nomeDoArquivo: string): boolean {
  return /\.stl$/i.test(nomeDoArquivo.trim());
}

/** "orc.stl" vira "orc.glb". */
export function nomeGlb(nomeDoArquivo: string): string {
  return nomeDoArquivo.replace(/\.stl$/i, '') + '.glb';
}

export async function converterStlParaGlb(arquivo: File): Promise<File> {
  const [T, { STLLoader }, { mergeVertices }, { GLTFExporter }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/STLLoader.js'),
    import('three/addons/utils/BufferGeometryUtils.js'),
    import('three/addons/exporters/GLTFExporter.js'),
  ]);

  let geometria = new STLLoader().parse(await arquivo.arrayBuffer());
  const posicoes = geometria.getAttribute('position');
  if (!posicoes || posicoes.count < 3) throw new Error('O .stl não tem triângulos.');
  const comCores = !!(geometria as unknown as { hasColors?: boolean }).hasColors;

  // as normais por face impedem juntar vértices; depois de juntar, recalcula normais suaves
  geometria.deleteAttribute('normal');
  geometria = mergeVertices(geometria);
  geometria.computeVertexNormals();
  geometria.rotateX(-Math.PI / 2); // de Z para cima (impressão 3D) para Y para cima
  geometria.scale(0.001, 0.001, 0.001); // .stl de impressão vem em mm; glTF é em metros (a escala "Impressao" lê de volta)

  const material = new T.MeshStandardMaterial({
    color: comCores ? 0xffffff : 0x9a958d,
    vertexColors: comCores,
    roughness: 0.75,
    metalness: 0.05,
  });
  const malha = new T.Mesh(geometria, material);
  malha.name = arquivo.name.replace(/\.stl$/i, '');

  const glb = (await new GLTFExporter().parseAsync(malha, { binary: true })) as ArrayBuffer;
  geometria.dispose();
  material.dispose();
  return new File([glb], nomeGlb(arquivo.name), { type: 'model/gltf-binary' });
}
