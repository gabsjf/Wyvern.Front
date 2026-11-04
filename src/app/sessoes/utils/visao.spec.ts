import { linhaLivre, maisProximo, poligonoDeVisao } from './visao';

describe('visao', () => {
  it('sem paredes, a visão é um círculo completo', () => {
    const pontos = poligonoDeVisao(500, 500, 200, []);
    expect(pontos.length).toBeGreaterThanOrEqual(180);
    for (const p of pontos) expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(200, 3);
  });

  it('uma parede corta a visão na distância dela', () => {
    // parede vertical 100 px à direita da origem
    const parede = { x1: 600, y1: 400, x2: 600, y2: 600 };
    const pontos = poligonoDeVisao(500, 500, 300, [parede]);
    const paraDireita = pontos.filter(p => Math.abs(p.y - 500) < 1 && p.x > 500);
    expect(paraDireita.length).toBeGreaterThan(0);
    for (const p of paraDireita) expect(p.x).toBeCloseTo(600, 3);
    // para o lado oposto, nada atrapalha
    const paraEsquerda = pontos.filter(p => Math.abs(p.y - 500) < 1 && p.x < 500);
    for (const p of paraEsquerda) expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(300, 3);
  });

  it('paredes fora do alcance não interferem', () => {
    const longe = { x1: 5000, y1: 0, x2: 5000, y2: 1000 };
    for (const p of poligonoDeVisao(500, 500, 200, [longe])) expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(200, 3);
  });

  it('linha de visão: livre sem parede, bloqueada com parede no meio', () => {
    const parede = { x1: 300, y1: 0, x2: 300, y2: 1000 };
    expect(linhaLivre(100, 500, 500, 500, [])).toBe(true);
    expect(linhaLivre(100, 500, 500, 500, [parede])).toBe(false);
    expect(linhaLivre(100, 500, 250, 500, [parede])).toBe(true); // a parede fica depois do alvo
  });

  it('um canto de parede deixa passar a luz ao lado dele', () => {
    const parede = { x1: 300, y1: 500, x2: 300, y2: 900 };
    expect(linhaLivre(100, 500, 500, 300, [parede])).toBe(true); // passa por cima da ponta
    expect(linhaLivre(100, 500, 500, 700, [parede])).toBe(false);
  });

  it('acha a parede mais próxima do clique, dentro da tolerância', () => {
    const a = { x1: 0, y1: 0, x2: 100, y2: 0, id: 'a' };
    const b = { x1: 0, y1: 50, x2: 100, y2: 50, id: 'b' };
    expect(maisProximo(40, 8, [a, b], 12)?.id).toBe('a');
    expect(maisProximo(40, 30, [a, b], 12)).toBeNull();
  });
});
