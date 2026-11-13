/** Um segmento da grade, em quadrados (os cantos ficam nos cruzamentos das linhas). */
export interface Trecho {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Divide uma parede em trechos de no máximo `passo` quadrados. No 3D dos jogadores cada trecho aparece
 * sozinho, conforme a névoa ao lado dele: uma parede longa não entrega a planta do que ainda está escondido.
 */
export function dividirEmTrechos(p: Trecho, passo = 1): Trecho[] {
  const comprimento = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
  if (comprimento === 0) return [];
  const partes = Math.max(1, Math.ceil(comprimento / passo - 1e-9));
  return Array.from({ length: partes }, (_, i) => ({
    x1: p.x1 + ((p.x2 - p.x1) * i) / partes,
    y1: p.y1 + ((p.y2 - p.y1) * i) / partes,
    x2: p.x1 + ((p.x2 - p.x1) * (i + 1)) / partes,
    y2: p.y1 + ((p.y2 - p.y1) * (i + 1)) / partes,
  }));
}

/**
 * Pontos para conferir a névoa dos DOIS lados de um trecho: no meio dele, afastados na perpendicular.
 * Paredes, portas e janelas ficam na divisa entre quadrados; olhar só o centro caía num lado só, e a porta
 * de uma sala revelada sumia quando a sala estava do outro lado.
 */
export function amostrasDosLados(t: Trecho, afastamento = 0.3): [number, number][] {
  const comprimento = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) || 1;
  const nx = -(t.y2 - t.y1) / comprimento;
  const ny = (t.x2 - t.x1) / comprimento;
  const cx = (t.x1 + t.x2) / 2;
  const cy = (t.y1 + t.y2) / 2;
  return [
    [cx + nx * afastamento, cy + ny * afastamento],
    [cx - nx * afastamento, cy - ny * afastamento],
  ];
}

/** O jogador vê o trecho se ao menos um dos lados está fora da névoa. */
export function algumLadoRevelado(amostras: [number, number][], revelado: (x: number, y: number) => boolean): boolean {
  return amostras.some(([x, y]) => revelado(x, y));
}
