import { algumLadoRevelado, amostrasDosLados, dividirEmTrechos } from './paredes-3d';

describe('paredes no 3D', () => {
  it('parede longa vira trechos de um quadrado, sem buracos nem sobras', () => {
    const trechos = dividirEmTrechos({ x1: 2, y1: 5, x2: 6, y2: 5 });
    expect(trechos).toEqual([
      { x1: 2, y1: 5, x2: 3, y2: 5 },
      { x1: 3, y1: 5, x2: 4, y2: 5 },
      { x1: 4, y1: 5, x2: 5, y2: 5 },
      { x1: 5, y1: 5, x2: 6, y2: 5 },
    ]);
  });

  it('parede de um quadrado (ou menos) fica inteira; parede sem comprimento some', () => {
    expect(dividirEmTrechos({ x1: 0, y1: 0, x2: 0, y2: 1 })).toHaveLength(1);
    expect(dividirEmTrechos({ x1: 3, y1: 3, x2: 3, y2: 3 })).toEqual([]);
  });

  it('diagonal é dividida pelo comprimento, terminando exatamente no fim', () => {
    const trechos = dividirEmTrechos({ x1: 0, y1: 0, x2: 3, y2: 3 });
    expect(trechos).toHaveLength(5); // ~4,24 quadrados
    expect(trechos.at(-1)).toMatchObject({ x2: 3, y2: 3 });
  });

  it('confere a névoa dos dois lados da divisa, não só da linha', () => {
    // parede vertical na coluna 4: um ponto em cada quadrado vizinho (colunas 3 e 4)
    const [a, b] = amostrasDosLados({ x1: 4, y1: 2, x2: 4, y2: 3 });
    expect(Math.floor(a[0])).not.toBe(Math.floor(b[0]));
    expect([a[1], b[1]]).toEqual([2.5, 2.5]);
  });

  it('porta aparece se a sala de qualquer um dos lados está revelada', () => {
    const porta = amostrasDosLados({ x1: 4, y1: 2, x2: 4, y2: 3 });
    const soEsquerda = (x: number) => x < 4;
    const soDireita = (x: number) => x >= 4;
    const nenhum = () => false;

    expect(algumLadoRevelado(porta, soEsquerda)).toBe(true);  // antes só a direita contava e a porta sumia
    expect(algumLadoRevelado(porta, soDireita)).toBe(true);
    expect(algumLadoRevelado(porta, nenhum)).toBe(false);
  });
});
