export interface Campaign {
    campanhaId?: number;
    nome: string;
    sistema?: string;
    mestreId?: number;
    mestreNome?: string;
    criadoEm?: string;
    ativo?: boolean;
    sessoes?: any[];
    // Papel do usuário logado NESTA campanha (definido pela API)
    papel?: 'Mestre' | 'Jogador';
}

export interface Membro {
    usuarioId: number;
    nome: string;
    papel: 'Mestre' | 'Jogador';
    entrouEm: string;
    ehCriador: boolean;
    ehVoce: boolean;
}

export interface Convite {
    token: string;
    // Quando o link deixa de valer (UTC); ausente em convites muito antigos
    expiraEm?: string;
}
