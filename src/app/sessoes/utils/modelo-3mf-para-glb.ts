/**
 * Converte um .3mf (o formato dos fatiadores de impressão 3D, com cor) num .glb, no navegador, antes de subir. Assim
 * o servidor, o mapa 3D e a prévia continuam lidando só com .glb.
 *
 * - Mantém as cores e materiais do padrão 3MF (materiais base, cor por triângulo e texturas). A pintura multicor do
 *   Bambu Studio e do PrusaSlicer fica num formato próprio deles, fora do padrão: essa não vem.
 * - Sem cor nenhuma, vira o mesmo cinza de miniatura sem pintura do .stl.
 * - Converte a unidade do arquivo (quase sempre milímetro) para metros e põe de pé (no 3MF, "para cima" é o Z).
 */

/** O .3mf é compactado: o .glb sai maior que ele. Acima disso o navegador pode travar convertendo. */
export const TAMANHO_MAXIMO_3MF = 40 * 1024 * 1024;

/** Limite do .3mf antes de converter: 40 MB, ou mais se a biblioteca aceitar .glb grandes. */
export function limiteDo3mf(limiteDoGlb: number): number {
  return Math.max(TAMANHO_MAXIMO_3MF, limiteDoGlb * 2);
}

export function eh3mf(nomeDoArquivo: string): boolean {
  return /\.3mf$/i.test(nomeDoArquivo.trim());
}

/** "orc.3mf" vira "orc.glb". */
export function nomeGlbDo3mf(nomeDoArquivo: string): string {
  return nomeDoArquivo.replace(/\.3mf$/i, '') + '.glb';
}

/** Quantos metros vale uma unidade de cada tipo que o 3MF aceita. */
const METROS_POR_UNIDADE: Record<string, number> = {
  micron: 1e-6,
  millimeter: 1e-3,
  centimeter: 1e-2,
  inch: 0.0254,
  foot: 0.3048,
  meter: 1,
};

const CINZA_DE_MINIATURA = 0x9a958d;
const ESPERA_DAS_TEXTURAS_MS = 15000;

export async function converter3mfParaGlb(arquivo: File): Promise<File> {
  const [T, { ThreeMFLoader }, { GLTFExporter }, { unzipSync }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/3MFLoader.js'),
    import('three/addons/exporters/GLTFExporter.js'),
    import('three/addons/libs/fflate.module.js'),
  ]);
  const bytes = await arquivo.arrayBuffer();

  // o leitor do Three.js não aplica a unidade: lê ela no modelo principal (3D/*.model, fora das subpastas)
  const raiz = unzipSync(new Uint8Array(bytes), { filter: f => /^3D\/[^/]*\.model$/i.test(f.name) });
  const xml = Object.values(raiz)[0];
  if (!xml) throw new Error('O .3mf não tem modelo.');
  const inicio = new TextDecoder().decode(xml.subarray(0, 4096));
  const unidade = /<model\b[^>]*\bunit\s*=\s*"([^"]+)"/i.exec(inicio)?.[1]?.toLowerCase() ?? 'millimeter';
  const metros = METROS_POR_UNIDADE[unidade] ?? METROS_POR_UNIDADE['millimeter'];

  // texturas carregam depois do parse: o gerente avisa quando terminam (sem textura, nem espera)
  const gerente = new T.LoadingManager();
  let comTextura = false;
  const texturasProntas = new Promise<void>((resolve, reject) => {
    gerente.onStart = () => { comTextura = true; };
    gerente.onLoad = () => resolve();
    gerente.onError = url => reject(new Error(`Textura do .3mf não abriu: ${url}`));
  });
  const leitor = new ThreeMFLoader(gerente);
  const modelo = leitor.parse(bytes);
  if (comTextura) {
    await Promise.race([
      texturasProntas,
      new Promise((_, reject) => setTimeout(() => reject(new Error('As texturas do .3mf demoraram demais.')), ESPERA_DAS_TEXTURAS_MS)),
    ]);
  }

  // as transformações do arquivo (posição na mesa do fatiador, peças) ficam gravadas na geometria; depois, de pé e em metros
  modelo.updateMatrixWorld(true);
  const ajuste = new T.Matrix4().makeRotationX(-Math.PI / 2).multiply(new T.Matrix4().makeScale(metros, metros, metros));
  const cena = new T.Group();
  const materiais = new Map<object, InstanceType<typeof T.MeshStandardMaterial>>();
  const liberar: { dispose(): void }[] = [];
  let triangulos = 0;
  modelo.traverse(o => {
    const m = o as InstanceType<typeof T.Mesh>;
    if (!m.isMesh) return;
    const geometria = m.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(ajuste, m.matrixWorld));
    triangulos += (geometria.index?.count ?? geometria.getAttribute('position').count) / 3;
    if (!geometria.getAttribute('normal')) geometria.computeVertexNormals();
    liberar.push(geometria);
    const original = (Array.isArray(m.material) ? m.material[0] : m.material) as InstanceType<typeof T.MeshPhongMaterial>;
    let material = materiais.get(original);
    if (!material) {
      material = paraPbr(T, original);
      materiais.set(original, material);
      liberar.push(material);
    }
    const malha = new T.Mesh(geometria, material);
    malha.name = m.name || o.parent?.name || '';
    cena.add(malha);
  });
  if (triangulos < 1) throw new Error('O .3mf não tem triângulos.');
  cena.name = arquivo.name.replace(/\.3mf$/i, '');

  try {
    const glb = (await new GLTFExporter().parseAsync(cena, { binary: true })) as ArrayBuffer;
    return new File([glb], nomeGlbDo3mf(arquivo.name), { type: 'model/gltf-binary' });
  } finally {
    for (const coisa of liberar) coisa.dispose();
    modelo.traverse(o => {
      const m = o as InstanceType<typeof T.Mesh>;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        (mat as { map?: { dispose(): void } | null }).map?.dispose();
        mat.dispose();
      }
    });
  }
}

type Three = typeof import('three');

/**
 * O leitor cria materiais Phong (que o glTF não tem) com sombreado chapado; troca por PBR, com a mesma cor, textura e
 * cor por vértice. O material "sem material" dele (branco) vira o cinza de miniatura.
 */
function paraPbr(T: Three, original: InstanceType<Three['MeshPhongMaterial']> | InstanceType<Three['MeshStandardMaterial']>) {
  const semCor = original.name === T.Loader.DEFAULT_MATERIAL_NAME;
  const pbr = original as InstanceType<Three['MeshStandardMaterial']>;
  return new T.MeshStandardMaterial({
    name: semCor ? '' : original.name,
    color: semCor ? CINZA_DE_MINIATURA : original.color.getHex(),
    map: original.map ?? null,
    vertexColors: original.vertexColors,
    transparent: original.transparent,
    opacity: original.opacity,
    roughness: pbr.isMeshStandardMaterial ? pbr.roughness : 0.75,
    metalness: pbr.isMeshStandardMaterial ? pbr.metalness : 0.05,
  });
}
