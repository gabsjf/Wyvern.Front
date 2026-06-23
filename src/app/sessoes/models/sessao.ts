export interface Sessao {
    sessaoId?: number;
    numeroSessao: number;
    nome: string;
    dataSessao: string;
    obs?: string;
    campanhaId: number;
    ativo?: boolean;
}
