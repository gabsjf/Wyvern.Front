export interface Personagem {
    personagemId?: number;
    nome: string;
    descricao?: string;
    campanhaId: number;
    /** Vem na listagem de personagens. */
    campanhaNome?: string | null;
    tipoId: number; // 1 = Jogador, 2 = NPC, 3 = Monstro
    criadoPorId?: number;
    /** Quem criou (o jogador dono, ou o Mestre nos NPCs e monstros). Vem na listagem de personagens. */
    criadoPorNome?: string | null;
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

// ---- subida de nível (regras do D&D 2024, calculadas pelo servidor) ----

export interface ValorComparado {
    antes: number;
    depois: number;
}

export interface ProximoNivel {
    /** A classe da ficha é uma das 12 do livro; senão só PV, proficiência e dados de vida são calculados. */
    classeReconhecida: boolean;
    classe: string;
    nivelAtual: number;
    proximoNivel: number;
    nivelDisponivel: number;
    podeSubir: boolean;
    motivo?: string | null;
    xp: number;
    xpProximoNivel?: number | null;
    nivelLiberado: number;
    dadoVida: number;
    pvFixo: number;
    modConstituicao: number;
    vidaMaxima: number;
    proficiencia: ValorComparado;
    caracteristicas: string[];
    recursos: { nome: string; antes?: string | null; depois?: string | null }[];
    espacosAntes?: number[] | null;
    espacosDepois?: number[] | null;
    truques?: ValorComparado | null;
    magiasPreparadas?: ValorComparado | null;
    escolheSubclasse: boolean;
    melhoriaDeAtributo: boolean;
    dadivaEpica: boolean;
    atributos: Record<string, number>;
}

export interface EscolhasDeNivel {
    modoPv: 'Fixo' | 'Rolado';
    pvRolado?: number;
    subclasse?: string;
    melhoria?: { tipo: 'Atributos' | 'Talento'; talento?: string; aumentos: Record<string, number> };
}

export interface ResultadoSubida {
    personagem: Personagem;
    nivelNovo: number;
    pvGanhos: number;
    resumo: string;
}
