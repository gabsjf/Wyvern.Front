// Os números que a ficha mostra e rola (bônus de ataque, CD de magia, perícias...), calculados num lugar só:
// a ficha completa e a ficha rápida da sessão precisam dar sempre o mesmo resultado.

import { Atributo } from './regras-da-ficha';

export interface Pericia { nome: string; atributo: Atributo }

/** As 18 perícias do livro, na ordem da ficha (agrupadas por atributo). */
export const PERICIAS: Pericia[] = [
  { nome: 'Atletismo', atributo: 'forca' },
  { nome: 'Acrobacia', atributo: 'destreza' },
  { nome: 'Furtividade', atributo: 'destreza' },
  { nome: 'Prestidigitação', atributo: 'destreza' },
  { nome: 'Arcanismo', atributo: 'inteligencia' },
  { nome: 'História', atributo: 'inteligencia' },
  { nome: 'Investigação', atributo: 'inteligencia' },
  { nome: 'Natureza', atributo: 'inteligencia' },
  { nome: 'Religião', atributo: 'inteligencia' },
  { nome: 'Adestrar Animais', atributo: 'sabedoria' },
  { nome: 'Intuição', atributo: 'sabedoria' },
  { nome: 'Medicina', atributo: 'sabedoria' },
  { nome: 'Percepção', atributo: 'sabedoria' },
  { nome: 'Sobrevivência', atributo: 'sabedoria' },
  { nome: 'Atuação', atributo: 'carisma' },
  { nome: 'Enganação', atributo: 'carisma' },
  { nome: 'Intimidação', atributo: 'carisma' },
  { nome: 'Persuasão', atributo: 'carisma' },
];

const SALVAGUARDA: Record<Atributo, string> = {
  forca: 'proficienciaSalvaguardaForca',
  destreza: 'proficienciaSalvaguardaDestreza',
  constituicao: 'proficienciaSalvaguardaConstituicao',
  inteligencia: 'proficienciaSalvaguardaInteligencia',
  sabedoria: 'proficienciaSalvaguardaSabedoria',
  carisma: 'proficienciaSalvaguardaCarisma',
};

/** Modificador de um valor de atributo (10 → 0, 15 → +2); sem valor, 0. */
export function mod(valor: number | null | undefined): number {
  if (valor === undefined || valor === null) return 0;
  return Math.floor((valor - 10) / 2);
}

export function sinal(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function proficiencia(p: any): number {
  return p?.personagemCombate?.proficienciaBonus || 0;
}

/** Modificador do atributo pelo nome (aceita "Destreza" ou "destreza"). */
export function modDoAtributo(p: any, atributo: string | null | undefined): number {
  if (!atributo || !p?.atributo) return 0;
  return mod(p.atributo[atributo.toLowerCase()]);
}

/** A iniciativa gravada na ficha, ou o modificador de Destreza. */
export function iniciativa(p: any): number {
  return p?.personagemCombate?.iniciativa || mod(p?.atributo?.destreza);
}

/** Bônus de acerto: atributo + proficiência + bônus fixo da arma. */
export function bonusDeAtaque(p: any, ataque: any): number {
  return modDoAtributo(p, ataque?.atributoBase)
    + (ataque?.proficiente ? proficiencia(p) : 0)
    + (ataque?.bonusAcerto || 0);
}

/** O dano com o modificador do atributo: "1d8" com Força +3 vira "1d8+3". */
export function danoDoAtaque(p: any, ataque: any): string {
  const m = modDoAtributo(p, ataque?.atributoBase);
  return m === 0 ? (ataque?.dano || '') : `${ataque?.dano || ''}${sinal(m)}`;
}

export function ehConjurador(p: any): boolean {
  const atributo = p?.personagemConjuracao?.atributoConjuracao;
  return !!atributo && atributo !== 'Nenhum';
}

export function bonusDeMagia(p: any): number {
  if (!ehConjurador(p)) return 0;
  return modDoAtributo(p, p.personagemConjuracao.atributoConjuracao) + proficiencia(p);
}

export function cdDeMagia(p: any): number {
  return ehConjurador(p) ? 8 + bonusDeMagia(p) : 10;
}

export function proficienteNaPericia(p: any, nome: string): boolean {
  return (p?.personagemPericias ?? []).some((x: any) => x.pericia?.nome?.toLowerCase() === nome.toLowerCase());
}

export function bonusDePericia(p: any, pericia: Pericia): number {
  return mod(p?.atributo?.[pericia.atributo]) + (proficienteNaPericia(p, pericia.nome) ? proficiencia(p) : 0);
}

export function proficienteNaSalvaguarda(p: any, atributo: Atributo): boolean {
  return !!p?.atributo?.[SALVAGUARDA[atributo]];
}

export function bonusDeSalvaguarda(p: any, atributo: Atributo): number {
  return mod(p?.atributo?.[atributo]) + (proficienteNaSalvaguarda(p, atributo) ? proficiencia(p) : 0);
}

export interface EspacosDoCirculo { nivel: number; atual: number; maximo: number }

/** Os círculos com espaços de magia (só os que a ficha tem). */
export function espacosDeMagia(p: any): EspacosDoCirculo[] {
  const c = p?.personagemConjuracao;
  if (!c) return [];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map(nivel => ({ nivel, atual: c['slotsNivel' + nivel + 'Atual'] ?? 0, maximo: c['slotsNivel' + nivel + 'Max'] ?? 0 }))
    .filter(e => e.maximo > 0);
}
