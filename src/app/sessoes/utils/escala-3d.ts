/**
 * Escala das miniaturas 3D, pela convenção da mesa física de D&D: o quadrado de 1,5 m (5 pés) do grid é o quadrado de
 * 1 polegada (25,4 mm) do tapete de batalha, e as bases oficiais são 25 mm (Pequeno/Médio), 50 mm (Grande), 75 mm
 * (Enorme) e 100 mm (Imenso). Na visão 3D, 1 unidade = 1 quadrado.
 *
 * O arquivo pode vir em três unidades:
 *  - miniatura de impressão em milímetros (o .stl típico; um humano tem ~30 mm de altura);
 *  - a mesma miniatura já em metros (o .stl convertido: ~0,03 m);
 *  - tamanho real em metros (o .glb de jogo/animação: um humano tem ~1,8 m).
 */

export type EscalaModelo = 'Auto' | 'Impressao' | 'Real' | 'Encaixar';

export const MM_POR_QUADRADO = 25.4;
export const METROS_REAIS_POR_QUADRADO = 1.524;

export const ESCALAS: { valor: EscalaModelo; nome: string; descricao: string }[] = [
  { valor: 'Auto', nome: 'Automática', descricao: 'Miniatura impressa pelas medidas; modelo de jogo cabe no token' },
  { valor: 'Impressao', nome: 'Miniatura impressa', descricao: 'Medidas de impressão: 25,4 mm = 1 quadrado' },
  { valor: 'Real', nome: 'Tamanho real', descricao: 'Medidas reais em metros: 1,5 m = 1 quadrado' },
  { valor: 'Encaixar', nome: 'Encaixar no token', descricao: 'Ignora as medidas e cabe na base do token' },
];

/** Como a escala automática lê a altura do arquivo (nas unidades do arquivo; glTF diz metros). */
export type LeituraDaAltura = 'mm' | 'impressaEmMetros' | 'realEmMetros';

export function lerAltura(altura: number): LeituraDaAltura {
  if (altura >= 10) return 'mm'; // 10 "metros" ou mais: é um .stl em mm (miniatura de 10 mm para cima)
  if (altura >= 0.25) return 'realEmMetros'; // de 25 cm a 10 m: tamanho real
  return 'impressaEmMetros'; // menos de 25 cm: miniatura de impressão já em metros
}

/**
 * Quantos quadrados vale 1 unidade do arquivo. Nulo = "Encaixar" (quem desenha ajusta ao token).
 * `altura` é a altura do modelo nas unidades do arquivo, usada pela escala automática.
 *
 * Na automática, só a miniatura de impressão segue as medidas: ela tem um padrão (25,4 mm por quadrado). Modelo de
 * jogo vem em metros, mas cada autor escolhe o tamanho (um dragão do Sketchfab tinha 3,6 m de envergadura): ele cabe no
 * token, e é o tamanho do token, escolhido pelo Mestre, que manda. "Real" continua usando as medidas.
 */
export function quadradosPorUnidade(escala: EscalaModelo | string | null | undefined, altura: number): number | null {
  if (escala === 'Encaixar') return null;
  if (escala === 'Real') return 1 / METROS_REAIS_POR_QUADRADO;
  if (escala === 'Impressao') return altura >= 10 ? 1 / MM_POR_QUADRADO : 1000 / MM_POR_QUADRADO;
  switch (lerAltura(altura)) {
    case 'mm': return 1 / MM_POR_QUADRADO;
    case 'impressaEmMetros': return 1000 / MM_POR_QUADRADO;
    default: return null;
  }
}

/** Categoria de tamanho do D&D pela largura da base, em quadrados (o lado maior visto de cima). */
export function tamanhoDnd(larguraEmQuadrados: number): { nome: string; lado: number } {
  if (larguraEmQuadrados <= 0.6) return { nome: 'Miúdo', lado: 1 };
  if (larguraEmQuadrados <= 1.25) return { nome: 'Pequeno ou Médio', lado: 1 };
  if (larguraEmQuadrados <= 2.25) return { nome: 'Grande', lado: 2 };
  if (larguraEmQuadrados <= 3.25) return { nome: 'Enorme', lado: 3 };
  return { nome: 'Imenso', lado: 4 };
}

export interface MedidasNaMesa {
  /** Altura e largura (lado maior da base), em quadrados. */
  altura: number;
  largura: number;
  /** As mesmas medidas como miniatura impressa, em mm. */
  alturaMm: number;
  larguraMm: number;
  tamanho: { nome: string; lado: number };
}

/** Como o modelo fica na mesa, a partir das medidas do arquivo. Nulo com "Encaixar" (depende do token). */
export function medidasNaMesa(
  medidas: { largura: number; profundidade: number; altura: number },
  escala: EscalaModelo | string | null | undefined,
): MedidasNaMesa | null {
  const fator = quadradosPorUnidade(escala, medidas.altura);
  if (fator === null) return null;
  const altura = medidas.altura * fator;
  const largura = Math.max(medidas.largura, medidas.profundidade) * fator;
  return {
    altura, largura,
    alturaMm: altura * MM_POR_QUADRADO,
    larguraMm: largura * MM_POR_QUADRADO,
    tamanho: tamanhoDnd(largura),
  };
}
