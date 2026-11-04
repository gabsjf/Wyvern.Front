/** Visão com obstáculos: tudo em pixels do mundo (a imagem do mapa). */

export interface Segmento {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Ponto {
  x: number;
  y: number;
}

/** Quanto, ao longo do raio (origem + t·direção), ele encontra o segmento; nulo se não encontra. */
function cruzamento(ox: number, oy: number, dx: number, dy: number, s: Segmento): number | null {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9) return null; // paralelos
  const t = ((s.x1 - ox) * sy - (s.y1 - oy) * sx) / den;
  const u = ((s.x1 - ox) * dy - (s.y1 - oy) * dx) / den;
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

function distanciaAoSegmento(px: number, py: number, s: Segmento): number {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const comprimento2 = sx * sx + sy * sy;
  const u = comprimento2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * sx + (py - s.y1) * sy) / comprimento2));
  return Math.hypot(px - (s.x1 + u * sx), py - (s.y1 + u * sy));
}

/**
 * A região que se enxerga a partir de (cx, cy) até o alcance `raio`, parando nas paredes: lança raios em todas
 * as direções (e um pouco antes e depois de cada ponta de parede, para os cantos saírem certos).
 */
export function poligonoDeVisao(cx: number, cy: number, raio: number, segmentos: Segmento[]): Ponto[] {
  const perto = segmentos.filter(s => distanciaAoSegmento(cx, cy, s) <= raio);
  const angulos: number[] = [];
  const passo = Math.PI / 90; // um raio a cada 2 graus no mínimo
  for (let a = -Math.PI; a < Math.PI; a += passo) angulos.push(a);
  for (const s of perto) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const a = Math.atan2(y - cy, x - cx);
      angulos.push(a - 1e-4, a, a + 1e-4);
    }
  }
  angulos.sort((a, b) => a - b);

  return angulos.map(a => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let alcance = raio;
    for (const s of perto) {
      const t = cruzamento(cx, cy, dx, dy, s);
      if (t !== null && t < alcance) alcance = t;
    }
    return { x: cx + dx * alcance, y: cy + dy * alcance };
  });
}

/** Verdadeiro se nenhuma parede corta o caminho de A até B. */
export function linhaLivre(ax: number, ay: number, bx: number, by: number, segmentos: Segmento[]): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  return !segmentos.some(s => {
    const t = cruzamento(ax, ay, dx, dy, s);
    return t !== null && t > 1e-6 && t < 1 - 1e-6;
  });
}

/** A parede mais próxima do ponto, dentro de `tolerancia` pixels; nulo se não houver. */
export function maisProximo<T extends Segmento>(px: number, py: number, itens: T[], tolerancia: number): T | null {
  let melhor: T | null = null;
  let menor = tolerancia;
  for (const s of itens) {
    const d = distanciaAoSegmento(px, py, s);
    if (d <= menor) { menor = d; melhor = s; }
  }
  return melhor;
}
