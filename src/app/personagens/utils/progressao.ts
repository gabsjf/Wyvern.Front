/**
 * XP mínimo de cada nível no D&D 2024 (índice 0 = nível 1). Só para mostrar a barra de XP:
 * quem decide se o personagem pode subir é o servidor.
 */
export const XP_POR_NIVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export interface BarraDeXp {
  xp: number;
  /** XP do nível atual e do próximo (nulo no nível 20). */
  inicio: number;
  fim: number | null;
  /** 0 a 100. */
  pct: number;
}

export function barraDeXp(nivel: number, xp: number): BarraDeXp {
  const n = Math.min(20, Math.max(1, nivel || 1));
  const inicio = XP_POR_NIVEL[n - 1];
  const fim = n < 20 ? XP_POR_NIVEL[n] : null;
  const pct = fim == null ? 100 : Math.max(0, Math.min(100, ((xp - inicio) / (fim - inicio)) * 100));
  return { xp, inicio, fim, pct };
}
