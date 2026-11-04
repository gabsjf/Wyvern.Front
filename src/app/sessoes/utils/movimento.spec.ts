import { alcance, barra, custoAte, indiceDe, quadradosCobertos, quadradosEm } from './movimento';

const grade = { colunas: 10, linhas: 10 };

describe('movimento', () => {
  it('quantos quadrados cabem nos metros', () => {
    expect(quadradosEm(9, 1.5)).toBe(6);
    expect(quadradosEm(10, 1.5)).toBe(6);
    expect(quadradosEm(9, 3)).toBe(3);
    expect(quadradosEm(1, 1.5)).toBe(0);
  });

  it('em campo aberto o alcance é um quadrado, com a diagonal valendo um', () => {
    const mapa = alcance(grade, 1, 5, 5, [], 2);
    expect(mapa.size).toBe(25);
    expect(mapa.get(indiceDe(grade, 7, 7))).toBe(2);
    expect(mapa.get(indiceDe(grade, 6, 4))).toBe(1);
    expect(mapa.has(indiceDe(grade, 8, 5))).toBe(false);
  });

  it('contorna a parede em vez de atravessar', () => {
    const parede = [{ x1: 5, y1: 0, x2: 5, y2: 8 }];
    expect(custoAte(grade, 1, 4, 2, 6, 2, [])).toBe(2);
    expect(custoAte(grade, 1, 4, 2, 6, 2, parede)!).toBeGreaterThan(8);
    expect(custoAte(grade, 1, 4, 2, 6, 2, parede, 8)).toBeNull(); // passa do limite
  });

  it('sem passagem nenhuma não há caminho', () => {
    expect(custoAte(grade, 1, 4, 2, 6, 2, [{ x1: 5, y1: 0, x2: 5, y2: 10 }])).toBeNull();
  });

  it('não escapa na diagonal pelo vértice onde duas paredes se encontram', () => {
    const sala = [
      { x1: 2, y1: 2, x2: 4, y2: 2 }, { x1: 4, y1: 2, x2: 4, y2: 4 },
      { x1: 4, y1: 4, x2: 2, y2: 4 }, { x1: 2, y1: 4, x2: 2, y2: 2 },
    ];
    expect(custoAte(grade, 1, 3, 3, 4, 4, sala)).toBeNull();
    expect(custoAte(grade, 1, 3, 3, 2, 2, sala)).toBe(1);
  });

  it('o token grande precisa caber no corredor', () => {
    const corredor = [{ x1: 4, y1: 0, x2: 4, y2: 10 }, { x1: 5, y1: 0, x2: 5, y2: 10 }];
    expect(alcance(grade, 1, 4, 0, corredor, 20).has(indiceDe(grade, 4, 9))).toBe(true);
    expect(alcance(grade, 2, 4, 0, corredor, 20).size).toBe(1); // o 2x2 nem sai do lugar
  });

  it('o token par não pode ficar dividido por uma parede', () => {
    const parede = [{ x1: 4, y1: 0, x2: 4, y2: 10 }];
    expect(custoAte(grade, 2, 2, 2, 3, 2, parede)).toBeNull(); // pararia com o centro sobre a parede
    expect(custoAte(grade, 2, 2, 2, 2, 4, parede)).toBe(2);
  });

  it('a regra de barrar: cruzar, ponta no caminho e destino sobre a parede', () => {
    const parede = { x1: 4, y1: 0, x2: 4, y2: 5 };
    expect(barra(3.5, 2.5, 4.5, 2.5, parede)).toBe(true); // cruza
    expect(barra(3.5, 7.5, 4.5, 7.5, parede)).toBe(false); // por baixo da ponta
    expect(barra(3, 5, 5, 5, parede)).toBe(true); // passa pela ponta
    expect(barra(3, 3, 4, 3, parede)).toBe(true); // destino sobre a parede
    expect(barra(4, 3, 3, 3, parede)).toBe(false); // a partida não conta
  });

  it('os quadrados cobertos incluem a área inteira do token grande', () => {
    const mapa = new Map([[indiceDe(grade, 2, 2), 0]]);
    const cobertos = quadradosCobertos(grade, 2, mapa);
    expect([...cobertos].sort((a, b) => a - b)).toEqual([22, 23, 32, 33]);
  });
});
