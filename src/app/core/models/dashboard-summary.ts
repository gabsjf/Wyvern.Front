import { CampanhaNaLista } from '../../campaigns/models/campaign';

/** Uma sessão no painel, com o nome da campanha. */
export interface SessaoNoPainel {
  sessaoId: number;
  numeroSessao: number;
  nome: string;
  dataSessao: string;
  dataAgendada?: string | null;
  campanhaId: number;
  campanhaNome: string;
}

export interface HeroiNoPainel {
  personagemId: number;
  nome: string;
  campanhaId: number;
  campanhaNome: string;
}

/** Tudo o que o painel mostra, numa resposta só (GET /Dashboard/resumo). */
export interface DashboardSummary {
  totalCampanhas: number;
  totalSessoes: number;
  totalHerois: number;
  totalNpcs: number;
  /** Monstros. */
  totalViloes: number;
  /** A campanha mais recente; nula quando não há nenhuma. */
  destaque: CampanhaNaLista | null;
  ultimaSessaoDoDestaque: SessaoNoPainel | null;
  /** Até 6, da mais nova para a mais antiga. */
  ultimasCampanhas: CampanhaNaLista[];
  /** Agendadas de hoje em diante (até 5). */
  proximasSessoes: SessaoNoPainel[];
  /** As últimas jogadas (até 5), para quando não há nada agendado. */
  sessoesRecentes: SessaoNoPainel[];
  /** Os heróis mais novos (até 8). */
  herois: HeroiNoPainel[];
}
