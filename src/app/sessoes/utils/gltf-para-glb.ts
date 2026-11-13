/**
 * Junta um .gltf (o JSON) e os arquivos que ele cita (.bin e texturas) num .glb só, no navegador, antes de subir. Assim
 * o servidor, o mapa 3D e a prévia continuam lidando só com .glb.
 *
 * Não passa pelo Three.js: só reempacota os bytes (é o mesmo formato, em pedaços), então nada se perde: materiais,
 * animações e extensões ficam como vieram. Buffers e imagens em `data:` (o "glTF Embedded" do Blender) também valem.
 */

/** Um .gltf que cita arquivos que não vieram junto na seleção. */
export class ArquivosDoGltfFaltando extends Error {
  constructor(readonly nomes: string[]) {
    super(`Faltam arquivos do .gltf: ${nomes.join(', ')}`);
  }
}

interface GltfJson {
  asset?: { version?: string };
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  images?: { uri?: string; mimeType?: string; bufferView?: number }[];
}

const TIPOS_POR_EXTENSAO: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
};

export function ehGltf(nomeDoArquivo: string): boolean {
  return /\.gltf$/i.test(nomeDoArquivo.trim());
}

/** "orc.gltf" vira "orc.glb". */
export function nomeGlbDoGltf(nomeDoArquivo: string): string {
  return nomeDoArquivo.replace(/\.gltf$/i, '') + '.glb';
}

const alinhar4 = (n: number): number => (n + 3) & ~3;

/** "texturas/Pele%20Orc.png?v=2" vira "pele orc.png": a seleção de arquivos não traz pastas, então vale só o nome. */
function nomeDaUri(uri: string): string {
  const caminho = uri.split(/[?#]/)[0];
  let nome = caminho.split('/').pop() ?? caminho;
  try { nome = decodeURIComponent(nome); } catch { /* fica como veio */ }
  return nome;
}

function lerDataUri(uri: string): { bytes: Uint8Array; tipo: string } {
  const virgula = uri.indexOf(',');
  const cabecalho = uri.slice(5, virgula);
  const dados = uri.slice(virgula + 1);
  const tipo = cabecalho.split(';')[0] || 'application/octet-stream';
  if (/;base64$/i.test(cabecalho)) {
    const texto = atob(dados);
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
    return { bytes, tipo };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(dados)), tipo };
}

/** `arquivos` é a seleção inteira: o .gltf e o que ele usa (outros arquivos sobrando são ignorados). */
export async function converterGltfParaGlb(arquivos: File[]): Promise<File> {
  const principal = arquivos.find(a => ehGltf(a.name));
  if (!principal) throw new Error('Nenhum .gltf entre os arquivos.');
  const gltf = JSON.parse(await principal.text()) as GltfJson;
  if (!String(gltf.asset?.version ?? '').startsWith('2')) throw new Error('Só glTF 2.0.');

  const porNome = new Map(arquivos.map(a => [a.name.toLowerCase(), a]));
  const faltando = new Set<string>();
  const ler = async (uri: string): Promise<{ bytes: Uint8Array; tipo: string } | null> => {
    if (uri.startsWith('data:')) return lerDataUri(uri);
    const nome = nomeDaUri(uri);
    const arquivo = porNome.get(nome.toLowerCase());
    if (!arquivo) { faltando.add(nome); return null; }
    const extensao = nome.split('.').pop()?.toLowerCase() ?? '';
    return { bytes: new Uint8Array(await arquivo.arrayBuffer()), tipo: TIPOS_POR_EXTENSAO[extensao] ?? arquivo.type };
  };

  // o bloco binário do .glb: os buffers e as imagens, um atrás do outro, cada um começando num múltiplo de 4
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const anexar = (bytes: Uint8Array): number => {
    const inicio = tamanho;
    partes.push(bytes);
    tamanho = alinhar4(tamanho + bytes.byteLength);
    if (tamanho > inicio + bytes.byteLength) partes.push(new Uint8Array(tamanho - inicio - bytes.byteLength));
    return inicio;
  };

  const inicioDoBuffer: number[] = [];
  for (const buffer of gltf.buffers ?? []) {
    if (!buffer.uri) throw new Error('Buffer sem arquivo no .gltf.');
    const lido = await ler(buffer.uri);
    if (!lido) { inicioDoBuffer.push(0); continue; }
    if (lido.bytes.byteLength < buffer.byteLength) throw new Error(`${nomeDaUri(buffer.uri)} é menor do que o .gltf diz.`);
    inicioDoBuffer.push(anexar(lido.bytes.subarray(0, buffer.byteLength)));
  }
  // as vistas apontavam para vários buffers; agora todas olham o bloco único
  for (const vista of gltf.bufferViews ?? []) {
    vista.byteOffset = (vista.byteOffset ?? 0) + (inicioDoBuffer[vista.buffer] ?? 0);
    vista.buffer = 0;
  }
  // as texturas entram no bloco também, cada uma numa vista nova
  for (const imagem of gltf.images ?? []) {
    if (!imagem.uri) continue;
    const lido = await ler(imagem.uri);
    if (!lido) continue;
    const vistas = (gltf.bufferViews ??= []);
    vistas.push({ buffer: 0, byteOffset: anexar(lido.bytes), byteLength: lido.bytes.byteLength });
    imagem.bufferView = vistas.length - 1;
    imagem.mimeType ??= lido.tipo;
    delete imagem.uri;
  }
  if (faltando.size) throw new ArquivosDoGltfFaltando([...faltando]);

  if (tamanho > 0) gltf.buffers = [{ byteLength: tamanho }];
  else delete gltf.buffers;

  // .glb: cabeçalho, bloco JSON (completado com espaços) e bloco BIN (completado com zeros)
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const tamanhoJson = alinhar4(json.byteLength);
  const total = 12 + 8 + tamanhoJson + (tamanho > 0 ? 8 + tamanho : 0);
  const saida = new Uint8Array(total);
  const dv = new DataView(saida.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, tamanhoJson, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  saida.set(json, 20);
  saida.fill(0x20, 20 + json.byteLength, 20 + tamanhoJson);
  if (tamanho > 0) {
    let p = 20 + tamanhoJson;
    dv.setUint32(p, tamanho, true);
    dv.setUint32(p + 4, 0x004e4942, true); // "BIN"
    p += 8;
    for (const parte of partes) { saida.set(parte, p); p += parte.byteLength; }
  }
  return new File([saida], nomeGlbDoGltf(principal.name), { type: 'model/gltf-binary' });
}
