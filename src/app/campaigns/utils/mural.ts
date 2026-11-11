import {
  CORES_DO_MURAL, ConectorMural, CorDoMural, ElementoMural, FormaDoElemento, PontaDoConector, QuadroMural, TamanhoDoTexto, TipoElemento,
} from '../models/mural';

export const TAMANHO_MINIMO = 24;

/** Tamanho com que cada tipo nasce quando é criado com um clique. */
export const TAMANHO_PADRAO: Record<TipoElemento, { w: number; h: number }> = {
  nota: { w: 200, h: 200 },
  texto: { w: 260, h: 60 },
  forma: { w: 180, h: 120 },
  imagem: { w: 320, h: 240 },
  cartao: { w: 260, h: 96 },
};

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Canto = 'nw' | 'ne' | 'sw' | 'se';

export function quadroVazio(): QuadroMural {
  return { versao: 1, elementos: [], conectores: [] };
}

export function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- ler o documento salvo (tolerante: o que não reconhece é descartado) ----------

const TIPOS: TipoElemento[] = ['nota', 'texto', 'forma', 'imagem', 'cartao'];
const FORMAS: FormaDoElemento[] = ['retangulo', 'elipse', 'losango'];
const TAMANHOS: TamanhoDoTexto[] = ['p', 'm', 'g'];
const CORES = new Set(CORES_DO_MURAL.map(c => c.id));

const numero = (v: unknown, padrao = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const cor = (v: unknown, padrao: CorDoMural): CorDoMural => (typeof v === 'string' && CORES.has(v as CorDoMural) ? (v as CorDoMural) : padrao);

function lerPonta(v: any): PontaDoConector {
  return { elementoId: typeof v?.elementoId === 'string' ? v.elementoId : undefined, x: numero(v?.x), y: numero(v?.y) };
}

/** Documento salvo → quadro. Texto vazio, inválido ou de outro formato vira um quadro vazio. */
export function lerQuadro(json: string | null | undefined): QuadroMural {
  let bruto: any;
  try { bruto = JSON.parse(json || '{}'); } catch { return quadroVazio(); }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return quadroVazio();

  const elementos: ElementoMural[] = (Array.isArray(bruto.elementos) ? bruto.elementos : [])
    .filter((e: any) => e && typeof e.id === 'string' && TIPOS.includes(e.tipo))
    .map((e: any): ElementoMural => {
      const padrao = TAMANHO_PADRAO[e.tipo as TipoElemento];
      const el: ElementoMural = {
        id: e.id,
        tipo: e.tipo,
        x: numero(e.x),
        y: numero(e.y),
        w: Math.max(TAMANHO_MINIMO, numero(e.w, padrao.w)),
        h: Math.max(TAMANHO_MINIMO, numero(e.h, padrao.h)),
        cor: cor(e.cor, e.tipo === 'texto' ? 'branco' : 'amarelo'),
        texto: texto(e.texto),
      };
      if (TAMANHOS.includes(e.tamanho)) el.tamanho = e.tamanho;
      if (e.tipo === 'forma') el.forma = FORMAS.includes(e.forma) ? e.forma : 'retangulo';
      if (e.tipo === 'imagem' && typeof e.imagemId === 'number') el.imagemId = e.imagemId;
      if (e.tipo === 'cartao' && e.ref && (e.ref.tipo === 'personagem' || e.ref.tipo === 'sessao') && typeof e.ref.id === 'number') {
        el.ref = { tipo: e.ref.tipo, id: e.ref.id, titulo: texto(e.ref.titulo), detalhe: texto(e.ref.detalhe) || undefined };
      }
      return el;
    })
    // imagem sem arquivo e cartão sem destino não têm o que mostrar
    .filter((e: ElementoMural) => (e.tipo !== 'imagem' || e.imagemId !== undefined) && (e.tipo !== 'cartao' || !!e.ref));

  const ids = new Set(elementos.map(e => e.id));
  const conectores: ConectorMural[] = (Array.isArray(bruto.conectores) ? bruto.conectores : [])
    .filter((c: any) => c && typeof c.id === 'string')
    .map((c: any): ConectorMural => ({ id: c.id, de: lerPonta(c.de), para: lerPonta(c.para), cor: cor(c.cor, 'cinza'), seta: c.seta !== false }))
    // ponta presa a um elemento que não existe mais fica solta onde estava
    .map((c: ConectorMural) => ({
      ...c,
      de: c.de.elementoId && !ids.has(c.de.elementoId) ? { x: c.de.x, y: c.de.y } : c.de,
      para: c.para.elementoId && !ids.has(c.para.elementoId) ? { x: c.para.x, y: c.para.y } : c.para,
    }));

  return { versao: 1, elementos, conectores };
}

// ---------- geometria ----------

export function centro(e: Retangulo): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/**
 * Onde a reta do centro do elemento até `alvo` sai pela borda dele: é ali que a seta encosta.
 * Respeita a forma (retângulo, elipse, losango); notas, textos, imagens e cartões são retângulos.
 */
export function pontoNaBorda(e: ElementoMural, alvo: { x: number; y: number }): { x: number; y: number } {
  const c = centro(e);
  const dx = alvo.x - c.x, dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const rx = e.w / 2, ry = e.h / 2;
  let t: number;
  if (e.tipo === 'forma' && e.forma === 'elipse') t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  else if (e.tipo === 'forma' && e.forma === 'losango') t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else t = Math.min(dx === 0 ? Infinity : rx / Math.abs(dx), dy === 0 ? Infinity : ry / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Onde a seta começa e termina, já encostando na borda dos elementos ligados. */
export function trechoDoConector(c: ConectorMural, elementos: ElementoMural[]): { x1: number; y1: number; x2: number; y2: number } {
  const porId = (id?: string) => (id ? elementos.find(e => e.id === id) : undefined);
  const de = porId(c.de.elementoId);
  const para = porId(c.para.elementoId);
  const pontoDe = de ? centro(de) : { x: c.de.x, y: c.de.y };
  const pontoPara = para ? centro(para) : { x: c.para.x, y: c.para.y };
  const inicio = de ? pontoNaBorda(de, pontoPara) : pontoDe;
  const fim = para ? pontoNaBorda(para, pontoDe) : pontoPara;
  return { x1: inicio.x, y1: inicio.y, x2: fim.x, y2: fim.y };
}

/** Retângulo de seleção a partir de dois cantos quaisquer. */
export function retanguloEntre(x1: number, y1: number, x2: number, y2: number): Retangulo {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function seCruzam(a: Retangulo, b: Retangulo): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Elementos tocados pelo retângulo de seleção. */
export function elementosNoRetangulo(elementos: ElementoMural[], r: Retangulo): string[] {
  return elementos.filter(e => seCruzam(e, r)).map(e => e.id);
}

/** O elemento de cima no ponto (o último desenhado). */
export function elementoEm(elementos: ElementoMural[], x: number, y: number, ignorar?: string): ElementoMural | undefined {
  for (let i = elementos.length - 1; i >= 0; i--) {
    const e = elementos[i];
    if (e.id !== ignorar && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
  }
  return undefined;
}

/** A caixa que contém tudo (para "ajustar à tela"). Nula num quadro vazio. */
export function limites(q: QuadroMural): Retangulo | null {
  const pontos: { x: number; y: number }[] = [];
  for (const e of q.elementos) pontos.push({ x: e.x, y: e.y }, { x: e.x + e.w, y: e.y + e.h });
  for (const c of q.conectores) {
    if (!c.de.elementoId) pontos.push(c.de);
    if (!c.para.elementoId) pontos.push(c.para);
  }
  if (!pontos.length) return null;
  const xs = pontos.map(p => p.x), ys = pontos.map(p => p.y);
  return retanguloEntre(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

/** Novo tamanho ao puxar um canto; o canto oposto fica parado. Com `proporcao`, mantém a proporção (imagens). */
export function redimensionar(original: Retangulo, canto: Canto, x: number, y: number, proporcao = false): Retangulo {
  const direita = original.x + original.w, baixo = original.y + original.h;
  const fixoX = canto.includes('w') ? direita : original.x;
  const fixoY = canto.includes('n') ? baixo : original.y;
  let w = Math.max(TAMANHO_MINIMO, canto.includes('w') ? fixoX - x : x - fixoX);
  let h = Math.max(TAMANHO_MINIMO, canto.includes('n') ? fixoY - y : y - fixoY);
  if (proporcao && original.w > 0 && original.h > 0) {
    const razao = original.w / original.h;
    if (w / h > razao) w = h * razao;
    else h = w / razao;
  }
  return { x: canto.includes('w') ? fixoX - w : fixoX, y: canto.includes('n') ? fixoY - h : fixoY, w, h };
}

// ---------- operações (sempre devolvem um quadro novo) ----------

/** Move elementos e as pontas soltas dos conectores escolhidos. */
export function mover(q: QuadroMural, ids: ReadonlySet<string>, dx: number, dy: number): QuadroMural {
  const solta = (p: PontaDoConector) => (p.elementoId ? p : { x: p.x + dx, y: p.y + dy });
  return {
    ...q,
    elementos: q.elementos.map(e => (ids.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)),
    conectores: q.conectores.map(c => (ids.has(c.id) ? { ...c, de: solta(c.de), para: solta(c.para) } : c)),
  };
}

/** Apaga o que foi escolhido; setas presas a um elemento apagado vão junto. */
export function remover(q: QuadroMural, ids: ReadonlySet<string>): QuadroMural {
  const elementos = q.elementos.filter(e => !ids.has(e.id));
  const sobra = new Set(elementos.map(e => e.id));
  const presoA = (p: PontaDoConector) => !!p.elementoId && !sobra.has(p.elementoId);
  return { ...q, elementos, conectores: q.conectores.filter(c => !ids.has(c.id) && !presoA(c.de) && !presoA(c.para)) };
}

/**
 * Copia o que foi escolhido, deslocado. Setas entre dois elementos copiados ligam as cópias; setas escolhidas
 * que apontam para fora continuam presas ao original. Devolve o quadro e os ids novos (para selecionar).
 */
export function duplicar(q: QuadroMural, ids: ReadonlySet<string>, deslocamento = 24): { quadro: QuadroMural; novos: string[] } {
  const mapa = new Map<string, string>();
  const copias = q.elementos.filter(e => ids.has(e.id)).map(e => {
    const id = novoId();
    mapa.set(e.id, id);
    return { ...e, id, x: e.x + deslocamento, y: e.y + deslocamento, ref: e.ref ? { ...e.ref } : undefined };
  });
  const ponta = (p: PontaDoConector): PontaDoConector =>
    p.elementoId ? (mapa.has(p.elementoId) ? { ...p, elementoId: mapa.get(p.elementoId) } : p) : { x: p.x + deslocamento, y: p.y + deslocamento };
  const ligaCopias = (c: ConectorMural) => !!c.de.elementoId && !!c.para.elementoId && mapa.has(c.de.elementoId) && mapa.has(c.para.elementoId);
  const setas = q.conectores
    .filter(c => ids.has(c.id) || ligaCopias(c))
    .map(c => ({ ...c, id: novoId(), de: ponta(c.de), para: ponta(c.para) }));
  return {
    quadro: { ...q, elementos: [...q.elementos, ...copias], conectores: [...q.conectores, ...setas] },
    novos: [...copias.map(c => c.id), ...setas.map(s => s.id)],
  };
}

/** Leva os escolhidos para cima de tudo (`frente`) ou para baixo de tudo, mantendo a ordem entre eles. */
export function reordenar(q: QuadroMural, ids: ReadonlySet<string>, frente: boolean): QuadroMural {
  const escolhidos = q.elementos.filter(e => ids.has(e.id));
  const resto = q.elementos.filter(e => !ids.has(e.id));
  return { ...q, elementos: frente ? [...resto, ...escolhidos] : [...escolhidos, ...resto] };
}

/** Muda uma propriedade dos elementos escolhidos (cor, forma, tamanho do texto...). */
export function alterarElementos(q: QuadroMural, ids: ReadonlySet<string>, mudanca: Partial<ElementoMural>): QuadroMural {
  return { ...q, elementos: q.elementos.map(e => (ids.has(e.id) ? { ...e, ...mudanca } : e)) };
}

export function alterarConectores(q: QuadroMural, ids: ReadonlySet<string>, mudanca: Partial<ConectorMural>): QuadroMural {
  return { ...q, conectores: q.conectores.map(c => (ids.has(c.id) ? { ...c, ...mudanca } : c)) };
}

/** O pedaço do quadro escolhido, pronto para copiar e colar: elementos e as setas entre eles (ou escolhidas). */
export function recorte(q: QuadroMural, ids: ReadonlySet<string>): QuadroMural {
  const elementos = q.elementos.filter(e => ids.has(e.id));
  const dentro = new Set(elementos.map(e => e.id));
  const pontaOk = (p: PontaDoConector) => !p.elementoId || dentro.has(p.elementoId);
  // seta escolhida que aponta para fora do recorte vira ponta solta onde ela estava
  const soltar = (p: PontaDoConector): PontaDoConector => (pontaOk(p) ? p : { x: p.x, y: p.y });
  const conectores = q.conectores
    .filter(c => ids.has(c.id) || (!!c.de.elementoId && !!c.para.elementoId && dentro.has(c.de.elementoId) && dentro.has(c.para.elementoId)))
    .map(c => ({ ...c, de: soltar(c.de), para: soltar(c.para) }));
  return { versao: 1, elementos, conectores };
}

/** Cola um recorte no quadro, com ids novos e deslocado. */
export function colar(q: QuadroMural, pedaco: QuadroMural, deslocamento = 24): { quadro: QuadroMural; novos: string[] } {
  // ids sempre novos: o recorte pode ter vindo deste mesmo quadro
  const mapa = new Map(pedaco.elementos.map(e => [e.id, novoId()] as const));
  const elementos = pedaco.elementos.map(e => ({ ...e, id: mapa.get(e.id)!, x: e.x + deslocamento, y: e.y + deslocamento, ref: e.ref ? { ...e.ref } : undefined }));
  const ponta = (p: PontaDoConector): PontaDoConector =>
    p.elementoId && mapa.has(p.elementoId) ? { ...p, elementoId: mapa.get(p.elementoId) } : { x: p.x + deslocamento, y: p.y + deslocamento };
  const conectores = pedaco.conectores.map(c => ({ ...c, id: novoId(), de: ponta(c.de), para: ponta(c.para) }));
  return {
    quadro: { ...q, elementos: [...q.elementos, ...elementos], conectores: [...q.conectores, ...conectores] },
    novos: [...elementos.map(e => e.id), ...conectores.map(c => c.id)],
  };
}

// ---------- desfazer / refazer ----------

/** Pilhas de estados (JSON) para desfazer e refazer. Registrar algo novo apaga o que dava para refazer. */
export class Historico {
  private antes: string[] = [];
  private depois: string[] = [];

  constructor(private readonly limite = 100) {}

  limpar(): void {
    this.antes = [];
    this.depois = [];
  }

  get podeDesfazer(): boolean { return this.antes.length > 0; }
  get podeRefazer(): boolean { return this.depois.length > 0; }

  /** Guarda o estado de ANTES de uma mudança. */
  registrar(estado: string): void {
    if (this.antes[this.antes.length - 1] === estado) return;
    this.antes.push(estado);
    if (this.antes.length > this.limite) this.antes.shift();
    this.depois = [];
  }

  desfazer(atual: string): string | null {
    const anterior = this.antes.pop();
    if (anterior === undefined) return null;
    this.depois.push(atual);
    return anterior;
  }

  refazer(atual: string): string | null {
    const proximo = this.depois.pop();
    if (proximo === undefined) return null;
    this.antes.push(atual);
    return proximo;
  }
}
