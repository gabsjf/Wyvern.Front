import {
  ajustarAoPalco, distanciaEmPes, distanciaEmQuadrados, iniciais, centroDoQuadrado, limitarAoMapa, quadradoEm, telaParaMundo, zoomEmTorno, ZOOM_MAX,
} from './mapa-geometria';

describe('mapa-geometria', () => {
  it('ajusta o mapa inteiro ao palco, centralizado', () => {
    const v = ajustarAoPalco(1000, 500, 2000, 500);
    expect(v.zoom).toBeCloseTo(0.48);
    expect(v.x).toBeCloseTo(20);
    expect(v.y).toBeCloseTo((500 - 500 * 0.48) / 2);
  });

  it('o zoom em torno de um ponto deixa esse ponto parado na tela', () => {
    const antes = { x: 40, y: -10, zoom: 1 };
    const cursor = { x: 300, y: 200 };
    const mundoAntes = telaParaMundo(antes, cursor.x, cursor.y);

    const depois = zoomEmTorno(antes, 2.5, cursor.x, cursor.y);

    const mundoDepois = telaParaMundo(depois, cursor.x, cursor.y);
    expect(mundoDepois.x).toBeCloseTo(mundoAntes.x);
    expect(mundoDepois.y).toBeCloseTo(mundoAntes.y);
    expect(depois.zoom).toBe(2.5);
  });

  it('o zoom respeita os limites', () => {
    expect(zoomEmTorno({ x: 0, y: 0, zoom: 1 }, 99, 0, 0).zoom).toBe(ZOOM_MAX);
  });

  it('acha o quadrado que contém o ponto', () => {
    expect(quadradoEm(0, 0, 70)).toEqual({ coluna: 0, linha: 0 });
    expect(quadradoEm(139, 140, 70)).toEqual({ coluna: 1, linha: 2 });
  });

  it('áreas de magia partem do centro do quadrado, nunca do vértice (WYV-24)', () => {
    expect(centroDoQuadrado(0, 0, 70)).toEqual({ x: 35, y: 35 });
    expect(centroDoQuadrado(69.9, 1, 70)).toEqual({ x: 35, y: 35 });
    expect(centroDoQuadrado(70, 139, 70)).toEqual({ x: 105, y: 105 });
    // de centro a centro, 4 quadrados em linha reta medem exatamente 4 casas
    const a = centroDoQuadrado(10, 10, 70), b = centroDoQuadrado(300, 10, 70);
    expect((b.x - a.x) / 70).toBe(4);
  });

  it('mantém o token inteiro dentro do mapa, qualquer que seja o tamanho', () => {
    // 10x10 quadrados
    expect(limitarAoMapa(99, -4, 1, 700, 700, 70)).toEqual({ coluna: 9, linha: 0 });
    expect(limitarAoMapa(9, 9, 2, 700, 700, 70)).toEqual({ coluna: 8, linha: 8 });
  });

  it('mede a diagonal como um quadrado só', () => {
    expect(distanciaEmQuadrados(0, 0, 3, 3)).toBe(3);
    expect(distanciaEmQuadrados(2, 5, 6, 4)).toBe(4);
    expect(distanciaEmPes(4)).toBe(20);
  });

  it('tira as iniciais do nome', () => {
    expect(iniciais('Brum Pedrafria')).toBe('BP');
    expect(iniciais('Goblin 2')).toBe('G2');
    expect(iniciais('lyra')).toBe('LY');
    expect(iniciais('   ')).toBe('?');
  });
});
