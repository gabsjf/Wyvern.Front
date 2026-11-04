/**
 * Interpretador de fórmulas de dados simples: "1d20+5", "2d6", "d8-1", "4d6+2+1".
 * Aceita vários termos de dados e constantes somados ou subtraídos.
 */

export interface TermoDado {
  quantidade: number;
  faces: number;
  /** 1 soma, -1 subtrai (ex.: "2d6-1d4"). */
  sinal: 1 | -1;
}

export interface FormulaAnalisada {
  termos: TermoDado[];
  /** Soma de todas as constantes (positivas e negativas). */
  modificador: number;
}

const LIMITE_DADOS = 60;
const LIMITE_FACES = 1000;

/** Devolve a fórmula decomposta, ou null se não for uma fórmula de dados válida. */
export function analisarFormula(texto: string): FormulaAnalisada | null {
  // "1d20 5" não vira "1d205": espaço no meio de um número é erro, não um número só
  if (/\d\s+\d/.test(texto ?? '')) return null;
  const limpo = (texto ?? '').replace(/\s+/g, '').toLowerCase();
  if (!limpo || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(limpo)) return null;

  const termos: TermoDado[] = [];
  let modificador = 0;
  let totalDados = 0;

  for (const parte of limpo.match(/[+-]?[^+-]+/g) ?? []) {
    const sinal: 1 | -1 = parte.startsWith('-') ? -1 : 1;
    const corpo = parte.replace(/^[+-]/, '');

    if (corpo.includes('d')) {
      const [q, f] = corpo.split('d');
      const quantidade = q === '' ? 1 : Number(q);
      const faces = Number(f);
      if (quantidade < 1 || faces < 2 || faces > LIMITE_FACES) return null;
      totalDados += quantidade;
      if (totalDados > LIMITE_DADOS) return null;
      termos.push({ quantidade, faces, sinal });
    } else {
      modificador += sinal * Number(corpo);
    }
  }

  return termos.length > 0 ? { termos, modificador } : null;
}

/** Texto de fórmula para um d20 com bônus: 5 → "1d20+5", -1 → "1d20-1", 0 → "1d20". */
export function formulaD20(bonus: number): string {
  if (bonus === 0) return '1d20';
  return bonus > 0 ? `1d20+${bonus}` : `1d20${bonus}`;
}

/** Rola a fórmula só com números aleatórios (sem animação). `sorteio` devolve um valor em [0, 1). */
export function sortearFaces(formula: FormulaAnalisada, sorteio: () => number = Math.random): number[] {
  return formula.termos.flatMap(t =>
    Array.from({ length: t.quantidade }, () => 1 + Math.floor(sorteio() * t.faces)));
}

/** Total de uma rolagem: faces dos dados (respeitando termos subtraídos) mais o modificador. */
export function totalDaRolagem(formula: FormulaAnalisada, faces: number[]): number {
  let indice = 0;
  let total = formula.modificador;
  for (const termo of formula.termos) {
    const dosDados = faces.slice(indice, indice + termo.quantidade);
    indice += termo.quantidade;
    total += termo.sinal * dosDados.reduce((soma, f) => soma + f, 0);
  }
  return total;
}
