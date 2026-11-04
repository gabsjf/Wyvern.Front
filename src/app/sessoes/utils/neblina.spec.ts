import { Neblina, aplicarRetangulo, areaRevelada, decodificar, estaRevelado, retanguloEntre } from './neblina';

function coberta(colunas = 10, linhas = 10): Neblina {
  return { ativa: true, colunas, linhas, bits: new Uint8Array(Math.ceil((colunas * linhas) / 8)) };
}

describe('neblina', () => {
  it('começa coberta e revela só o retângulo pedido', () => {
    const n = aplicarRetangulo(coberta(), { coluna: 2, linha: 3, largura: 3, altura: 2 }, true);
    expect(estaRevelado(n, 2, 3)).toBe(true);
    expect(estaRevelado(n, 4, 4)).toBe(true);
    expect(estaRevelado(n, 5, 3)).toBe(false);
    expect(estaRevelado(n, 1, 3)).toBe(false);
    expect(estaRevelado(n, 2, 5)).toBe(false);
  });

  it('cobre de volta e não altera a névoa original', () => {
    const base = aplicarRetangulo(coberta(), { coluna: 0, linha: 0, largura: 10, altura: 10 }, true);
    const depois = aplicarRetangulo(base, { coluna: 3, linha: 3, largura: 1, altura: 1 }, false);
    expect(estaRevelado(depois, 3, 3)).toBe(false);
    expect(estaRevelado(depois, 4, 3)).toBe(true);
    expect(estaRevelado(base, 3, 3)).toBe(true);
  });

  it('corta o retângulo que passa do mapa e ignora o que está fora', () => {
    const n = aplicarRetangulo(coberta(), { coluna: 8, linha: 8, largura: 50, altura: 50 }, true);
    expect(estaRevelado(n, 9, 9)).toBe(true);
    expect(estaRevelado(n, 10, 9)).toBe(false);
    expect(estaRevelado(n, -1, 0)).toBe(false);
  });

  it('um token grande aparece se qualquer quadrado dele estiver revelado', () => {
    const n = aplicarRetangulo(coberta(), { coluna: 5, linha: 5, largura: 1, altura: 1 }, true);
    expect(areaRevelada(n, 4, 4, 2)).toBe(true);
    expect(areaRevelada(n, 0, 0, 2)).toBe(false);
  });

  it('o retângulo entre dois quadrados vale em qualquer direção', () => {
    expect(retanguloEntre(5, 5, 2, 3)).toEqual({ coluna: 2, linha: 3, largura: 4, altura: 3 });
  });

  it('lê o formato do servidor (base64, bit 0 = primeiro quadrado)', () => {
    const n: Neblina = { ativa: true, colunas: 4, linhas: 2, bits: decodificar('BQ==') }; // 0b00000101
    expect(estaRevelado(n, 0, 0)).toBe(true);
    expect(estaRevelado(n, 1, 0)).toBe(false);
    expect(estaRevelado(n, 2, 0)).toBe(true);
  });
});
