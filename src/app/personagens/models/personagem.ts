export interface Personagem {
    personagemId?: number;
    nome: string;
    descricao?: string;
    campanhaId: number;
    tipoId: number; // 1 = Jogador, 2 = NPC, 3 = Monstro
    criadoPorId?: number;
    criadoEm?: string;
    ativo?: boolean;
    atributo?: any;
    personagemPlayer?: any;
    personagemCombate?: any;
    personagemDetalhes?: any;
    personagemDinheiro?: any;
}
