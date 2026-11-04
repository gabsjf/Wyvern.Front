/**
 * Deslocamento de um token pelo mapa: por onde ele pode ir e quanto custa. É uma cópia da regra do servidor
 * (MovimentoRegras.cs), usada para desenhar o alcance e avisar antes de enviar; quem decide é o servidor.
 * Posições são o canto superior esquerdo do token, em quadrados; paredes são segmentos entre cruzamentos da grade.
 */
import { Segmento } from './visao';

export interface Grade {
  colunas: number;
  linhas: number;
}

/** Índice de uma posição no mapa de distâncias devolvido por `alcance`. */
export function indiceDe(grade: Grade, coluna: number, linha: number): number {
  return linha * grade.colunas + coluna;
}

/** Quantos quadrados cabem em tantos metros (inteiros, para baixo). */
export function quadradosEm(metros: number, metrosPorQuadrado: number): number {
  return Math.floor(metros / metrosPorQuadrado + 1e-9);
}

const lado = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const dentro = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
  px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by);

/**
 * A parede barra o passo A→B? Cruzar, ter uma ponta sobre o caminho (fora da partida) ou o destino sobre a parede
 * barram; a partida nunca conta, porque dali o token já está saindo.
 */
export function barra(ax: number, ay: number, bx: number, by: number, s: Segmento): boolean {
  const d1 = lado(ax, ay, bx, by, s.x1, s.y1);
  const d2 = lado(ax, ay, bx, by, s.x2, s.y2);
  const d3 = lado(s.x1, s.y1, s.x2, s.y2, ax, ay);
  const d4 = lado(s.x1, s.y1, s.x2, s.y2, bx, by);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true; // cruza de verdade
  if (d1 === 0 && dentro(ax, ay, bx, by, s.x1, s.y1) && !(s.x1 === ax && s.y1 === ay)) return true;
  if (d2 === 0 && dentro(ax, ay, bx, by, s.x2, s.y2) && !(s.x2 === ax && s.y2 === ay)) return true;
  return d4 === 0 && dentro(s.x1, s.y1, s.x2, s.y2, bx, by);
}

/** Paredes agrupadas por célula, para testar só as que estão perto de cada passo. */
class Barreiras {
  private celulas = new Map<number, Segmento[]>();

  constructor(segmentos: Segmento[]) {
    for (const s of segmentos) {
      // cada parede entra nas células que pode tocar (com uma de folga, por causa das bordas)
      const c0 = Math.min(s.x1, s.x2) - 1, c1 = Math.max(s.x1, s.x2);
      const l0 = Math.min(s.y1, s.y2) - 1, l1 = Math.max(s.y1, s.y2);
      for (let l = l0; l <= l1; l++) {
        for (let c = c0; c <= c1; c++) {
          const chave = Barreiras.chave(c, l);
          const lista = this.celulas.get(chave);
          if (lista) lista.push(s);
          else this.celulas.set(chave, [s]);
        }
      }
    }
  }

  private static chave(c: number, l: number): number {
    return (l + 2) * 100003 + (c + 2);
  }

  em(c: number, l: number): Segmento[] {
    return this.celulas.get(Barreiras.chave(c, l)) ?? [];
  }
}

/** O segmento tem algum trecho estritamente dentro do quadrado (Liang-Barsky no quadrado fechado). */
function atravessaInterior(s: Segmento, x0: number, y0: number, tamanho: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const recortar = (d: number, distancia: number): boolean => {
    if (d === 0) return distancia >= 0;
    const t = distancia / d;
    if (d < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (!recortar(-dx, s.x1 - x0) || !recortar(dx, x0 + tamanho - s.x1) || !recortar(-dy, s.y1 - y0) || !recortar(dy, y0 + tamanho - s.y1)) return false;
  if (t0 >= t1) return false;
  const mx = s.x1 + (dx * (t0 + t1)) / 2;
  const my = s.y1 + (dy * (t0 + t1)) / 2;
  return mx > x0 && mx < x0 + tamanho && my > y0 && my < y0 + tamanho;
}

/** Token de tamanho maior que 1 "dividido" por uma parede que passa por dentro dele. */
function dividido(b: Barreiras, tamanho: number, coluna: number, linha: number): boolean {
  if (tamanho <= 1) return false;
  for (let j = 0; j < tamanho; j++)
    for (let i = 0; i < tamanho; i++)
      for (const s of b.em(coluna + i, linha + j)) if (atravessaInterior(s, coluna, linha, tamanho)) return true;
  return false;
}

/** Um passo (dc, dl) com o token inteiro: o centro de cada quadrado que ele ocupa não pode cruzar nenhuma parede. */
function passoLivre(b: Barreiras, tamanho: number, coluna: number, linha: number, dc: number, dl: number): boolean {
  for (let j = 0; j < tamanho; j++) {
    for (let i = 0; i < tamanho; i++) {
      const ax = coluna + i + 0.5, ay = linha + j + 0.5, bx = ax + dc, by = ay + dl;
      const perto = [...b.em(coluna + i, linha + j), ...b.em(coluna + i + dc, linha + j + dl)];
      if (perto.some(s => barra(ax, ay, bx, by, s))) return false;
    }
  }
  return true;
}

/**
 * Distância, em quadrados, de cada posição que o token alcança a partir de (coluna, linha), até `limite`: 8 direções,
 * a diagonal custa 1, paredes e portas fechadas (já filtradas em `paredes`) barram. A chave é `indiceDe`.
 * Se `alvo` for dado, para assim que ele for alcançado.
 */
export function alcance(
  grade: Grade, tamanho: number, coluna: number, linha: number, paredes: Segmento[], limite: number,
  alvo?: { coluna: number; linha: number },
): Map<number, number> {
  const b = new Barreiras(paredes);
  const distancias = new Map<number, number>([[indiceDe(grade, coluna, linha), 0]]);
  if (alvo && alvo.coluna === coluna && alvo.linha === linha) return distancias;

  const fila: [number, number][] = [[coluna, linha]];
  for (let inicio = 0; inicio < fila.length; inicio++) {
    const [c, l] = fila[inicio];
    const d = distancias.get(indiceDe(grade, c, l))!;
    if (d >= limite) continue;

    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dl === 0) continue;
        const nc = c + dc, nl = l + dl;
        if (nc < 0 || nl < 0 || nc + tamanho > grade.colunas || nl + tamanho > grade.linhas) continue;
        if (distancias.has(indiceDe(grade, nc, nl))) continue;
        if (dividido(b, tamanho, nc, nl) || !passoLivre(b, tamanho, c, l, dc, dl)) continue;

        distancias.set(indiceDe(grade, nc, nl), d + 1);
        if (alvo && alvo.coluna === nc && alvo.linha === nl) return distancias;
        fila.push([nc, nl]);
      }
    }
  }
  return distancias;
}

/** Quantos quadrados custa ir de uma posição a outra pelo caminho mais curto; nulo se não há caminho (ou passa do limite). */
export function custoAte(
  grade: Grade, tamanho: number, coluna: number, linha: number, destinoColuna: number, destinoLinha: number,
  paredes: Segmento[], limite = Number.POSITIVE_INFINITY,
): number | null {
  const mapa = alcance(grade, tamanho, coluna, linha, paredes, limite, { coluna: destinoColuna, linha: destinoLinha });
  return mapa.get(indiceDe(grade, destinoColuna, destinoLinha)) ?? null;
}

/** Os quadrados que o token cobre quando está em cada posição alcançável (para pintar o alcance). */
export function quadradosCobertos(grade: Grade, tamanho: number, mapa: Map<number, number>): Set<number> {
  const cobertos = new Set<number>();
  for (const indice of mapa.keys()) {
    const c = indice % grade.colunas, l = Math.floor(indice / grade.colunas);
    for (let j = 0; j < tamanho; j++)
      for (let i = 0; i < tamanho; i++) cobertos.add(indiceDe(grade, c + i, l + j));
  }
  return cobertos;
}
