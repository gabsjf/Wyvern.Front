import type { EscalaModelo } from '../utils/escala-3d';
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
  /** Para onde a miniatura 3D olha: graus, sentido horário visto de cima. */
  rotacao: number;
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
  /** Miniatura 3D escolhida no próprio token (nula = herda a do personagem). */
  modeloId?: number | null;
  /** A miniatura que vale na visão 3D: a do token, senão a do personagem. */
  miniaturaId?: number | null;
  /** Usuários (fora o Mestre) que podem mover o token. */
  donosIds: number[];
}

export type TokenForm = Pick<TokenCena, 'nome' | 'coluna' | 'linha' | 'tamanho' | 'cor' | 'inimigo' | 'oculto' | 'visao'> &
  Partial<Pick<TokenCena, 'personagemId' | 'participanteId' | 'controladoPorId' | 'modeloId'>> & {
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

// ---------- modelos 3D (WYV-25/26) ----------


export type CategoriaModelo = 'Cenario' | 'Miniatura';

/** Um .glb da biblioteca da campanha. */
export interface Modelo3d {
  modeloId: number;
  nome: string;
  categoria: CategoriaModelo;
  /** Como as medidas do arquivo viram quadrados (ver utils/escala-3d). */
  escala: EscalaModelo;
  /** Bytes. */
  tamanho: number;
  enviadoPorId: number | null;
  enviadoPorNome: string | null;
  criadoEm: string;
}

export interface BibliotecaDeModelos {
  modelos: Modelo3d[];
  espacoUsado: number;
  espacoTotal: number;
  tamanhoMaximoArquivo: number;
}

/** Peça de cenário posta no mapa: ocupa um quadrado de `tamanho` x `tamanho` a partir de (coluna, linha). */
/** Onde a peça está e como está, montada no editor 3D. Tudo em quadrados (com fração) e graus. */
export interface TransformacaoDaPeca {
  /** Centro da base; y é a altura acima do chão. */
  x: number;
  y: number;
  z: number;
  /** Tamanho em cada eixo: 1 = o lado maior da peça, visto de cima, ocupa um quadrado. */
  escalaX: number;
  escalaY: number;
  escalaZ: number;
  /** Graus em volta do eixo vertical, sentido horário visto de cima. */
  rotacao: number;
  /** Inclinação nos eixos deitados. */
  giroX: number;
  giroZ: number;
}

export interface ObjetoCena extends TransformacaoDaPeca {
  objetoId: number;
  cenaId: number;
  modeloId: number;
  nome: string;
  /** O quadrado que a peça ocupa (tirado da posição e da escala), para o mapa 2D e a névoa. */
  coluna: number;
  linha: number;
  tamanho: number;
  oculto: boolean;
}

/** Com x e z, vale a posição livre; sem eles, coluna/linha/tamanho (como o mapa 2D põe a peça). */
export type ObjetoCenaForm = Pick<ObjetoCena, 'modeloId' | 'coluna' | 'linha' | 'tamanho' | 'rotacao' | 'oculto'> & Partial<TransformacaoDaPeca>;
