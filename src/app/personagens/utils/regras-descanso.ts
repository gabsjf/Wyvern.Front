/**
 * Regras de descanso do D&D 5e (versão 2024), em funções puras para a tela só se preocupar com a interface.
 *
 *  - Descanso curto (1 hora): gasta dados de vida; cada um cura o resultado do dado + modificador de Constituição
 *    (nunca menos que 0), até o máximo de PV.
 *  - Descanso longo (8 horas): volta a todos os PV, recupera dados de vida gastos até a metade do total (no mínimo 1),
 *    devolve todos os espaços de magia e zera os PV temporários.
 *
 * O servidor confere os limites (ver DescansoService no back-end); aqui se calcula o que propor ao usuário.
 */

export interface DadosDeVida {
  /** Faces do dado (10 em "5d10"); 0 se a ficha não informa. */
  faces: number;
  total: number;
  gasto: number;
  disponiveis: number;
}

export interface Rolagem {
  face: number;
  /** PV curados por este dado: face + mod. de Constituição, mínimo 0. */
  cura: number;
}

export interface ResultadoDescanso {
  tipo: 'Curto' | 'Longo';
  vidaAtual: number;
  vidaTemporaria: number;
  dadoVidaGasto: number;
  deathSaveSucessos: number;
  deathSaveFalhas: number;
  restaurarEspacosMagia: boolean;
}

const DADO_DE_VIDA = /^\s*(\d*)\s*d\s*(\d+)/i;

/** Lê "5d10" (5 dados de 10 faces). Sem quantidade ("d10") ou sem texto, o total é o nível — igual ao servidor. */
export function dadosDeVida(personagem: any): DadosDeVida {
  const combate = personagem?.personagemCombate;
  const nivel = Math.max(0, personagem?.personagemPlayer?.nivel ?? 0);
  const m = DADO_DE_VIDA.exec(combate?.dadoVidaMaximo ?? '');

  const faces = m ? Number(m[2]) : 0;
  const total = m && m[1] ? Number(m[1]) : nivel;
  const gasto = Math.max(0, combate?.dadoVidaGasto ?? 0);
  return { faces, total, gasto, disponiveis: Math.max(0, total - gasto) };
}

export function modConstituicao(personagem: any): number {
  const constituicao = personagem?.atributo?.constituicao ?? 10;
  return Math.floor((constituicao - 10) / 2);
}

export function temEspacosDeMagia(personagem: any): boolean {
  const c = personagem?.personagemConjuracao;
  return !!c && [1, 2, 3, 4, 5, 6, 7, 8, 9].some(n => (c['slotsNivel' + n + 'Max'] ?? 0) > 0);
}

/** Rola `quantidade` dados de `faces` faces. `sorteio` devolve um número em [0, 1) e existe para os testes. */
export function rolarDadosDeVida(quantidade: number, faces: number, modCon: number, sorteio: () => number = Math.random): Rolagem[] {
  return Array.from({ length: Math.max(0, quantidade) }, () => {
    const face = 1 + Math.floor(sorteio() * faces);
    return { face, cura: Math.max(0, face + modCon) };
  });
}

export function curaTotal(rolagens: Rolagem[]): number {
  return rolagens.reduce((soma, r) => soma + r.cura, 0);
}

/** Resultado de um descanso curto em que `dadosGastos` dados curaram `cura` PV no total. */
export function resultadoCurto(personagem: any, dadosGastos: number, cura: number, restaurarEspacos = false): ResultadoDescanso {
  const combate = personagem?.personagemCombate ?? {};
  const max = combate.vidaMaxima ?? 0;
  const atual = combate.vidaAtual ?? max;
  const vida = Math.min(max, atual + Math.max(0, cura));
  // quem volta a ter PV deixa de precisar das salvaguardas de morte
  const consciente = vida > 0;

  return {
    tipo: 'Curto',
    vidaAtual: vida,
    vidaTemporaria: combate.vidaTemporaria ?? 0,
    dadoVidaGasto: (combate.dadoVidaGasto ?? 0) + Math.max(0, dadosGastos),
    deathSaveSucessos: consciente ? 0 : combate.deathSaveSucessos ?? 0,
    deathSaveFalhas: consciente ? 0 : combate.deathSaveFalhas ?? 0,
    restaurarEspacosMagia: restaurarEspacos,
  };
}

/** Resultado padrão de um descanso longo, pelas regras. */
export function resultadoLongo(personagem: any): ResultadoDescanso {
  const combate = personagem?.personagemCombate ?? {};
  const dados = dadosDeVida(personagem);
  const recuperados = Math.max(1, Math.floor(dados.total / 2));

  return {
    tipo: 'Longo',
    vidaAtual: combate.vidaMaxima ?? 0,
    vidaTemporaria: 0,
    dadoVidaGasto: Math.max(0, dados.gasto - recuperados),
    deathSaveSucessos: 0,
    deathSaveFalhas: 0,
    restaurarEspacosMagia: temEspacosDeMagia(personagem),
  };
}
