/**
 * Regras de pontos de vida do D&D 5e, em funções puras:
 *  - dano gasta primeiro os PV temporários e só o que sobra tira dos PV de verdade;
 *  - cura não restaura PV temporários e nunca passa do máximo;
 *  - quem estava com 0 PV e volta a ter PV zera as salvaguardas de morte.
 */

export interface VidaAtual {
  vida: number;
  maxima: number;
  temporarios: number;
}

export interface MudancaDeVida {
  vidaAtual: number;
  vidaTemporaria: number;
  /** Só presente quando a pessoa saiu de 0 PV: as salvaguardas de morte voltam a zero. */
  deathSaveSucessos?: 0;
  deathSaveFalhas?: 0;
}

export function aplicarDano(estado: VidaAtual, dano: number): MudancaDeVida {
  const total = Math.max(0, Math.floor(dano));
  const absorvido = Math.min(estado.temporarios, total);
  return {
    vidaAtual: Math.max(0, estado.vida - (total - absorvido)),
    vidaTemporaria: estado.temporarios - absorvido,
  };
}

export function aplicarCura(estado: VidaAtual, cura: number): MudancaDeVida {
  const vida = Math.min(estado.maxima, estado.vida + Math.max(0, Math.floor(cura)));
  const levantou = estado.vida <= 0 && vida > 0;
  return {
    vidaAtual: vida,
    vidaTemporaria: estado.temporarios,
    ...(levantou ? { deathSaveSucessos: 0 as const, deathSaveFalhas: 0 as const } : {}),
  };
}

/** Clicar na marca `n` (1 a 3) de uma salvaguarda: marca até ela; clicar de novo na última marcada desmarca uma. */
export function alternarMarca(atual: number, n: number): number {
  return atual >= n ? n - 1 : n;
}
