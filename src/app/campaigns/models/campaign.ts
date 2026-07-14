export interface Campaign {
    campanhaId?: number;
    nome: string;
    sistema?: string;
    mestreId?: number;
    criadoEm?: string;
    ativo?: boolean;
    sessoes?: any[];
}
