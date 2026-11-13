import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Mesh, Object3D } from 'three';
import type { CategoriaModelo } from '../models/cena';
import { criarLeitorGltf } from './leitor-gltf';

/**
 * Deixa um .glb leve para a mesa antes de subir: arquivos de impressão 3D vêm com 1 a 4 milhões de triângulos (detalhe
 * de 0,05 mm), mas no grid a miniatura ocupa poucos pixels e 95% deles nem aparecem. Simplifica a malha (meshoptimizer),
 * mantém materiais, texturas, esqueleto e animações, e limita as texturas a 2048 px.
 */

/** Quantos triângulos cada tipo de modelo pode ter na mesa (uma miniatura de jogo AAA tem de 30 a 100 mil). */
export const META_DE_TRIANGULOS: Record<CategoriaModelo, number> = {
  Miniatura: 50_000,
  Cenario: 100_000,
};

/** Passando da meta em até isto, nem vale simplificar. */
const FOLGA = 1.25;
/** Erros aceitos (fração do tamanho do modelo), do mais fiel ao que chega na meta de qualquer jeito. */
const ERROS = [0.01, 0.04, 0.15, 1];
const LADO_MAXIMO_DA_TEXTURA = 2048;

export interface ResultadoDaOtimizacao {
  arquivo: File;
  antes: number;
  depois: number;
}

interface GltfJson {
  meshes?: { primitives: { mode?: number; indices?: number; attributes: Record<string, number> }[] }[];
  nodes?: { mesh?: number }[];
  accessors?: { count: number }[];
}

/** As texturas do modelo não abriram: a versão otimizada sairia sem cor, então não sai. */
export class TexturasPerdidas extends Error {
  constructor() {
    super('As texturas do modelo não abriram; a versão otimizada ficaria sem cor.');
  }
}

function lerJsonGlb(bytes: ArrayBuffer): (GltfJson & { images?: unknown[] }) | null {
  const dv = new DataView(bytes);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return null;
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, dv.getUint32(12, true))));
}

function contarImagensGlb(bytes: ArrayBuffer): number {
  return lerJsonGlb(bytes)?.images?.length ?? 0;
}

/** Triângulos que o .glb desenha (cada uso de uma malha conta), lendo só o JSON dele: rápido, sem abrir o modelo. */
export function contarTriangulosGlb(bytes: ArrayBuffer): number {
  const gltf = lerJsonGlb(bytes);
  if (!gltf) return 0;
  const porMalha = (gltf.meshes ?? []).map(m => m.primitives.reduce((soma, p) => {
    const mode = p.mode ?? 4;
    const n = gltf.accessors?.[p.indices ?? p.attributes['POSITION']]?.count ?? 0;
    return soma + (mode === 4 ? Math.floor(n / 3) : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  }, 0));
  const usos = (gltf.nodes ?? []).filter(n => n.mesh !== undefined).map(n => n.mesh!);
  return (usos.length ? usos : porMalha.map((_, i) => i)).reduce((soma, i) => soma + (porMalha[i] ?? 0), 0);
}

/** Simplifica se passar da meta; devolve null quando o modelo já é leve (aí sobe como veio). */
export async function otimizarGlb(arquivo: File, meta: number): Promise<ResultadoDaOtimizacao | null> {
  const bytes = await arquivo.arrayBuffer();
  const antes = contarTriangulosGlb(bytes);
  if (antes <= meta * FOLGA) return null;

  const [T, leitor, { GLTFExporter }, { mergeVertices }, { MeshoptSimplifier }] = await Promise.all([
    import('three'),
    criarLeitorGltf(),
    import('three/addons/exporters/GLTFExporter.js'),
    import('three/addons/utils/BufferGeometryUtils.js'),
    import('meshoptimizer'),
  ]);
  await MeshoptSimplifier.ready;

  const gltf = await leitor.parseAsync(bytes, '');
  // cada geometria uma vez só, mesmo se várias malhas a usam; o peso dela é o número de usos
  const usos = new Map<BufferGeometry, Mesh[]>();
  gltf.scene.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as { isPoints?: boolean }).isPoints) return;
    const lista = usos.get(m.geometry);
    if (lista) lista.push(m);
    else usos.set(m.geometry, [m]);
  });
  const triangulosDe = (g: BufferGeometry): number => Math.floor((g.index?.count ?? g.getAttribute('position').count) / 3);
  let total = 0;
  for (const [g, malhas] of usos) total += triangulosDe(g) * malhas.length;
  if (total <= meta * FOLGA) return null;
  const proporcao = meta / total;

  let depois = 0;
  for (const [original, malhas] of usos) {
    const alvo = Math.max(12, Math.floor(triangulosDe(original) * proporcao));
    const nova = simplificarGeometria(T, MeshoptSimplifier, mergeVertices, original, alvo);
    for (const m of malhas) m.geometry = nova;
    depois += triangulosDe(nova) * malhas.length;
    if (nova !== original) original.dispose();
  }

  const glb = (await new GLTFExporter().parseAsync(gltf.scene, {
    binary: true,
    animations: gltf.animations,
    maxTextureSize: LADO_MAXIMO_DA_TEXTURA,
  })) as ArrayBuffer;
  gltf.scene.traverse((o: Object3D) => (o as Mesh).geometry?.dispose());
  // o leitor engole a textura que não abre: melhor não subir nada do que subir o modelo sem cor
  if (contarImagensGlb(bytes) > 0 && contarImagensGlb(glb) === 0) {
    throw new TexturasPerdidas();
  }
  const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.glb';
  return { arquivo: new File([glb], nome, { type: 'model/gltf-binary' }), antes, depois };
}

type Three = typeof import('three');
type Simplificador = (typeof import('meshoptimizer'))['MeshoptSimplifier'];
type Juntar = (typeof import('three/addons/utils/BufferGeometryUtils.js'))['mergeVertices'];

/**
 * Uma geometria com no máximo `alvo` triângulos (ou perto disso). Cada grupo (parte com outro material) é simplificado à
 * parte, para as cores não se misturarem. As costuras de UV e de normal ficam no lugar (o meshoptimizer as detecta).
 */
function simplificarGeometria(T: Three, simplificador: Simplificador, juntar: Juntar, original: BufferGeometry, alvo: number): BufferGeometry {
  let g = original;
  let recalcularNormais = false;
  if (!g.index) {
    // sem índice (triângulos soltos, como num .stl): junta os vértices iguais; as normais por face impediriam isso
    g = g.clone();
    if (g.getAttribute('normal')) { g.deleteAttribute('normal'); recalcularNormais = true; }
    g = juntar(g);
  }
  const posicao = g.getAttribute('position');
  const posicoes = new Float32Array(posicao.count * 3);
  for (let i = 0; i < posicao.count; i++) {
    posicoes[i * 3] = posicao.getX(i);
    posicoes[i * 3 + 1] = posicao.getY(i);
    posicoes[i * 3 + 2] = posicao.getZ(i);
  }
  const indices = Uint32Array.from(g.index!.array);
  const total = Math.floor(indices.length / 3);
  const grupos = g.groups.length ? g.groups : [{ start: 0, count: indices.length, materialIndex: 0 }];

  const partes: Uint32Array[] = [];
  const novosGrupos: { start: number; count: number; materialIndex?: number }[] = [];
  let inicio = 0;
  for (const grupo of grupos) {
    const trecho = indices.slice(grupo.start, grupo.start + grupo.count);
    const alvoDoGrupo = Math.max(1, Math.floor(alvo * (trecho.length / 3) / total)) * 3;
    let resultado: Uint32Array = trecho;
    for (const erro of ERROS) {
      [resultado] = simplificador.simplify(trecho, posicoes, 3, alvoDoGrupo, erro);
      if (resultado.length <= alvoDoGrupo * FOLGA) break;
    }
    partes.push(resultado);
    novosGrupos.push({ start: inicio, count: resultado.length, materialIndex: grupo.materialIndex });
    inicio += resultado.length;
  }
  const juntos = new Uint32Array(inicio);
  let p = 0;
  for (const parte of partes) { juntos.set(parte, p); p += parte.length; }

  // tira os vértices que nenhum triângulo usa mais (é isso que faz o arquivo encolher)
  const [mapa, unicos] = simplificador.compactMesh(juntos);
  const nova = new T.BufferGeometry();
  nova.setIndex(new T.BufferAttribute(unicos > 65535 ? juntos : Uint16Array.from(juntos), 1));
  for (const [nome, atributo] of Object.entries(g.attributes)) nova.setAttribute(nome, compactar(T, atributo, mapa, unicos));
  for (const [nome, lista] of Object.entries(g.morphAttributes)) {
    (nova.morphAttributes as Record<string, BufferAttribute[]>)[nome] = lista.map(a => compactar(T, a, mapa, unicos));
  }
  nova.morphTargetsRelative = g.morphTargetsRelative;
  if (g.groups.length) for (const grupo of novosGrupos) nova.addGroup(grupo.start, grupo.count, grupo.materialIndex);
  if (recalcularNormais) nova.computeVertexNormals();
  nova.name = original.name;
  if (g !== original) g.dispose();
  return nova;
}

/** Copia o atributo só com os vértices que sobraram, no mesmo tipo (inteiros dos ossos continuam inteiros). */
function compactar(T: Three, atributo: BufferAttribute | InterleavedBufferAttribute, mapa: Uint32Array, unicos: number): BufferAttribute {
  const n = atributo.itemSize;
  const intercalado = (atributo as InterleavedBufferAttribute).isInterleavedBufferAttribute;
  const fonte = intercalado ? (atributo as InterleavedBufferAttribute).data.array : (atributo as BufferAttribute).array;
  const passo = intercalado ? (atributo as InterleavedBufferAttribute).data.stride : n;
  const deslocamento = intercalado ? (atributo as InterleavedBufferAttribute).offset : 0;
  const Tipo = fonte.constructor as new (tamanho: number) => typeof fonte;
  const destino = new Tipo(unicos * n);
  for (let v = 0; v < mapa.length; v++) {
    const novo = mapa[v];
    if (novo === 0xffffffff) continue;
    for (let c = 0; c < n; c++) destino[novo * n + c] = fonte[v * passo + deslocamento + c];
  }
  return new T.BufferAttribute(destino, n, atributo.normalized);
}
