export type TipoEvento = 'Marco' | 'Combate' | 'Descoberta' | 'Morte' | 'Viagem' | 'Diplomacia' | 'Descanso' | 'Outro';

export const TIPOS_EVENTO: { tipo: TipoEvento; icone: string }[] = [
    { tipo: 'Marco', icone: '★' },
    { tipo: 'Combate', icone: '⚔' },
    { tipo: 'Descoberta', icone: '✦' },
    { tipo: 'Morte', icone: '☠' },
    { tipo: 'Viagem', icone: '➳' },
    { tipo: 'Diplomacia', icone: '⚖' },
    { tipo: 'Descanso', icone: '☾' },
    { tipo: 'Outro', icone: '✎' },
];

/** Como a API devolve um evento da crônica. */
export interface EventoCampanhaApi {
    eventoId: number;
    campanhaId: number;
    titulo: string;
    descricao: string; // Markdown
    tipo: TipoEvento;
    sessaoId?: number | null;
    sessaoNumero?: number | null;
    rotuloData?: string | null;
    ordem: number;
    // 'Mestre' esconde o evento dos jogadores (segredos e spoilers)
    visibilidade: 'Todos' | 'Mestre';
    // 'Automatico' vem de combate, descanso ou sessão; 'Manual' foi escrito por alguém
    origem: 'Manual' | 'Automatico';
    autorId?: number | null;
    autorNome: string;
    criadoEm: string;
}

export interface EventoCampanha extends EventoCampanhaApi {
    /** Calculado aqui: o autor é quem está logado? */
    autorEhVoce: boolean;
}

/** O que a tela envia para criar ou editar um evento. */
export interface EventoForm {
    titulo: string;
    descricao: string;
    tipo: TipoEvento;
    sessaoId?: number | null;
    rotuloData?: string;
    ordem?: number | null;
    soMestre: boolean;
}

export interface SessaoResumo {
    sessaoId: number;
    numero: number;
    nome: string;
    data: string;
}
