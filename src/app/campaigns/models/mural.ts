/** Um mural na lista (sem o documento). */
export interface MuralResumo {
  muralId: number;
  nome: string;
  atualizadoEm: string;
}

/** O mural aberto: o documento vem como texto JSON e é lido por `lerQuadro`. */
export interface MuralSalvo {
  muralId: number;
  campanhaId: number;
  nome: string;
  conteudo: string;
  versao: number;
  atualizadoEm: string;
}

export type TipoElemento = 'nota' | 'texto' | 'forma' | 'imagem' | 'cartao';
export type FormaDoElemento = 'retangulo' | 'elipse' | 'losango';
export type CorDoMural = 'amarelo' | 'laranja' | 'rosa' | 'roxo' | 'azul' | 'verde' | 'cinza' | 'branco';
export type TamanhoDoTexto = 'p' | 'm' | 'g';

/** Um cartão aponta para algo da campanha: abre a ficha ou a sessão. */
export interface RefDoCartao {
  tipo: 'personagem' | 'sessao';
  id: number;
  titulo: string;
  detalhe?: string;
}

/** Tudo no quadro tem posição e tamanho em unidades do mundo (pixels com zoom 100%). */
export interface ElementoMural {
  id: string;
  tipo: TipoElemento;
  x: number;
  y: number;
  w: number;
  h: number;
  cor: CorDoMural;
  texto: string;
  tamanho?: TamanhoDoTexto;
  forma?: FormaDoElemento;
  imagemId?: number;
  ref?: RefDoCartao;
}

/** A ponta de uma seta: presa a um elemento (acompanha quando ele se move) ou solta num ponto. */
export interface PontaDoConector {
  elementoId?: string;
  x: number;
  y: number;
}

export interface ConectorMural {
  id: string;
  de: PontaDoConector;
  para: PontaDoConector;
  cor: CorDoMural;
  /** Ponta com seta no destino; sem ela, só uma linha. */
  seta: boolean;
}

/** O documento salvo. A ordem dos elementos é a ordem de desenho (o último fica por cima). */
export interface QuadroMural {
  versao: 1;
  elementos: ElementoMural[];
  conectores: ConectorMural[];
}

/** Cores do mural: o fundo das notas e formas e o traço das setas e bordas. */
export const CORES_DO_MURAL: { id: CorDoMural; nome: string; fundo: string; traco: string }[] = [
  { id: 'amarelo', nome: 'Amarelo', fundo: '#fde68a', traco: '#b7791f' },
  { id: 'laranja', nome: 'Laranja', fundo: '#fdba74', traco: '#c2410c' },
  { id: 'rosa', nome: 'Rosa', fundo: '#f9a8d4', traco: '#be185d' },
  { id: 'roxo', nome: 'Roxo', fundo: '#c4b5fd', traco: '#6d28d9' },
  { id: 'azul', nome: 'Azul', fundo: '#93c5fd', traco: '#1d4ed8' },
  { id: 'verde', nome: 'Verde', fundo: '#86efac', traco: '#15803d' },
  { id: 'cinza', nome: 'Cinza', fundo: '#d6d3d1', traco: '#57534e' },
  { id: 'branco', nome: 'Branco', fundo: '#fafaf9', traco: '#a8a29e' },
];
