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
    personagemItens?: PersonagemItem[];
    personagemMagias?: PersonagemMagia[];
    personagemAtaques?: PersonagemAtaque[];
    personagemNpc?: any;
    personagemAcoesPadrao?: any[];
    personagemAcoesBonus?: any[];
    personagemReacoes?: any[];
    personagemAcoesLendarias?: any[];
    personagemTracosEspeciais?: any[];
}

export interface PersonagemItem {
    personagemItemId: number;
    personagemId: number;
    nome: string;
    tipoItem: string;
    raridade: string;
    descricao?: string;
}

export interface PersonagemMagia {
    personagemMagiaId?: number;
    personagemId: number;
    nome: string;
    nivel: number;
    escola?: string;
    verbal?: boolean;
    somatico?: boolean;
    material?: boolean;
    descricao?: string;
}

export interface PersonagemAtaque {
    personagemAtaqueId?: number;
    nome: string;
    alcance?: string;
    bonusAcerto: number;
    dano?: string;
    tipoDano?: string;
    propriedades?: string;
}
