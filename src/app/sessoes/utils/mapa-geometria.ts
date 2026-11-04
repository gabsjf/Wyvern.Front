/** Geometria do mapa tático: tudo em pixels da imagem ("mundo") e em quadrados da grade. */

export interface Vista {
  /** Deslocamento do mundo na tela, em pixels da tela. */
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** Um quadrado da grade vale 5 pés (regra do D&D 5e). */
export const PES_POR_QUADRADO = 5;

export function limitarZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Vista que mostra o mapa inteiro, centralizado no palco, com uma folga pequena. */
export function ajustarAoPalco(palcoL: number, palcoA: number, mapaL: number, mapaA: number): Vista {
  const zoom = limitarZoom(Math.min(palcoL / mapaL, palcoA / mapaA) * 0.96);
  return { zoom, x: (palcoL - mapaL * zoom) / 2, y: (palcoA - mapaA * zoom) / 2 };
}

/** Muda o zoom mantendo fixo o ponto da tela (cx, cy) — por exemplo, o cursor ou o centro da pinça. */
export function zoomEmTorno(vista: Vista, novoZoom: number, cx: number, cy: number): Vista {
  const zoom = limitarZoom(novoZoom);
  const razao = zoom / vista.zoom;
  return { zoom, x: cx - (cx - vista.x) * razao, y: cy - (cy - vista.y) * razao };
}

/** Ponto da tela (relativo ao palco) para o mundo. */
export function telaParaMundo(vista: Vista, tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - vista.x) / vista.zoom, y: (ty - vista.y) / vista.zoom };
}

/** Quadrado (coluna, linha) que contém o ponto do mundo. */
export function quadradoEm(x: number, y: number, celula: number): { coluna: number; linha: number } {
  return { coluna: Math.floor(x / celula), linha: Math.floor(y / celula) };
}

/** Mantém um token de `tamanho` quadrados inteiro dentro do mapa. */
export function limitarAoMapa(
  coluna: number, linha: number, tamanho: number, mapaL: number, mapaA: number, celula: number,
): { coluna: number; linha: number } {
  const colunas = Math.max(1, Math.floor(mapaL / celula));
  const linhas = Math.max(1, Math.floor(mapaA / celula));
  return {
    coluna: Math.min(Math.max(0, coluna), Math.max(0, colunas - tamanho)),
    linha: Math.min(Math.max(0, linha), Math.max(0, linhas - tamanho)),
  };
}

/** Distância entre dois quadrados: a diagonal conta como 1 (regra básica do 5e). */
export function distanciaEmQuadrados(c1: number, l1: number, c2: number, l2: number): number {
  return Math.max(Math.abs(c2 - c1), Math.abs(l2 - l1));
}

export function distanciaEmPes(quadrados: number): number {
  return quadrados * PES_POR_QUADRADO;
}

/** "Brum Pedrafria" → "BP"; "Goblin 2" → "G2". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  const [primeira, ...resto] = partes;
  const ultima = resto[resto.length - 1];
  return (primeira[0] + (/^\d+$/.test(ultima) ? ultima : ultima[0])).toUpperCase();
}
