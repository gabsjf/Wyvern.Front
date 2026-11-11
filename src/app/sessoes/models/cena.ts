export interface Cena {
  cenaId: number;
  campanhaId: number;
  nome: string;
  largura: number;
  altura: number;
  /** Lado de um quadrado da grade (5 pés), em pixels da imagem. */
  tamanhoCelula: number;
  /** A cena que os jogadores veem. */
  ativa: boolean;
  ordem: number;
  imagemVersao: number;
  neblinaAtiva: boolean;
  /** Sessão da mesa a que o mapa pertence (organização). */
  sessaoId: number | null;
  /** No combate, o jogador só move o token de quem está na vez. */
  soNoTurno: boolean;
  /** Metros que vale um quadrado da grade (5 pés = 1,5 m). */
  metrosPorQuadrado: number;
  /** No combate, o jogador só anda o deslocamento da ficha por turno. */
  limitarDeslocamento: boolean;
}

/** Chaves das cores de token; cada uma vira uma cor no CSS do mapa. */
export const CORES_TOKEN = ['ouro', 'carmim', 'verde', 'azul', 'violeta', 'laranja', 'cinza', 'branco'] as const;
export type CorToken = (typeof CORES_TOKEN)[number];

export interface TokenCena {
  tokenId: number;
  cenaId: number;
  nome: string;
  /** Posição em quadrados da grade (canto superior esquerdo do token). */
  coluna: number;
  linha: number;
  /** Lado, em quadrados (1 a 4). */
  tamanho: number;
  cor: CorToken;
  inimigo: boolean;
  oculto: boolean;
  /** Raio de visão em pés (0 = nenhum): com névoa, abre um círculo ao redor do token. */
  visao: number;
  /** 0 = sem retrato (mostra as iniciais). Muda a cada troca. */
  imagemVersao: number;
  /** Deslocamento que vale, em metros (o manual, senão o da ficha); nulo = sem limite conhecido. */
  deslocamentoMetros: number | null;
  /** O que o Mestre escreveu no token; nulo = vale a ficha. */
  deslocamentoManual: number | null;
  /** O que a ficha do personagem diz, em metros. */
  deslocamentoDaFicha: number | null;
  /** Quadrados já andados no turno indicado por `movimentoTurno`. */
  movimentoGasto: number;
  /** "combateId:rodada:participanteDaVez" a que o gasto se refere. */
  movimentoTurno: string | null;
  personagemId: number | null;
  participanteId: number | null;
  controladoPorId: number | null;
  /** Usuários (fora o Mestre) que podem mover o token. */
  donosIds: number[];
}

export type TokenForm = Pick<TokenCena, 'nome' | 'coluna' | 'linha' | 'tamanho' | 'cor' | 'inimigo' | 'oculto' | 'visao'> &
  Partial<Pick<TokenCena, 'personagemId' | 'participanteId' | 'controladoPorId'>> & {
    /** Deslocamento à mão em metros; nulo usa o da ficha. */
    deslocamentoMetros?: number | null;
    /** Zera o que o token já andou no turno. */
    restaurarMovimento?: boolean;
  };

/** Segmento de parede ou porta entre dois cruzamentos da grade (em quadrados). */
export interface Parede {
  paredeId: number;
  cenaId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  porta: boolean;
  aberta: boolean;
  /** Bloqueia o movimento, mas não a visão (grade, janela, balcão). */
  janela: boolean;
}

export type ParedeForm = Pick<Parede, 'x1' | 'y1' | 'x2' | 'y2' | 'porta' | 'aberta' | 'janela'>;

/** Ícones de marcador: a chave vai para o servidor; o desenho é um ícone do Bootstrap Icons. */
export const ICONES_MARCADOR = [
  { chave: 'pino', icone: 'bi-geo-alt-fill', nome: 'Local' },
  { chave: 'armadilha', icone: 'bi-exclamation-triangle-fill', nome: 'Armadilha' },
  { chave: 'tesouro', icone: 'bi-gem', nome: 'Tesouro' },
  { chave: 'bau', icone: 'bi-box2-fill', nome: 'Baú' },
  { chave: 'chave', icone: 'bi-key-fill', nome: 'Chave' },
  { chave: 'segredo', icone: 'bi-eye-fill', nome: 'Segredo' },
  { chave: 'altar', icone: 'bi-fire', nome: 'Altar' },
  { chave: 'perigo', icone: 'bi-lightning-charge-fill', nome: 'Perigo' },
  { chave: 'caveira', icone: 'bi-emoji-dizzy-fill', nome: 'Caveira' },
  { chave: 'pergunta', icone: 'bi-question-lg', nome: 'Dúvida' },
] as const;
export type ChaveDeMarcador = (typeof ICONES_MARCADOR)[number]['chave'];

/** Um ponto de interesse no mapa. */
export interface Marcador {
  marcadorId: number;
  cenaId: number;
  coluna: number;
  linha: number;
  icone: ChaveDeMarcador;
  titulo: string;
  nota: string;
  /** Escondido, só o Mestre vê. */
  visivel: boolean;
}

export type MarcadorForm = Pick<Marcador, 'coluna' | 'linha' | 'icone' | 'titulo' | 'nota' | 'visivel'>;

/** Um traço de desenho livre; pontos em pixels da imagem. */
export interface Traco {
  tracoId: number;
  cenaId: number;
  usuarioId: number | null;
  cor: CorToken;
  espessura: number;
  pontos: [number, number][];
}

export interface MovimentoToken {
  tokenId: number;
  cenaId: number;
  coluna: number;
  linha: number;
  movimentoGasto?: number;
  movimentoTurno?: string | null;
}
