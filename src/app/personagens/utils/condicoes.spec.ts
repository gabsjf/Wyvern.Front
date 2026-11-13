import { CONDICOES, alternarCondicao, escreverCondicoes, lerCondicoes, temCondicao } from './condicoes';

describe('condições', () => {
  it('lê o texto da ficha sem vazios nem repetidos, na ordem em que aparecem', () => {
    expect(lerCondicoes('Envenenado, Caído;  ,envenenado, Cego')).toEqual(['Envenenado', 'Caído', 'Cego']);
    expect(lerCondicoes(null)).toEqual([]);
    expect(lerCondicoes('')).toEqual([]);
  });

  it('escreve a lista separada por vírgula', () => {
    expect(escreverCondicoes(['Envenenado', 'Caído'])).toBe('Envenenado, Caído');
    expect(escreverCondicoes([])).toBe('');
  });

  it('procura a condição sem diferenciar maiúsculas', () => {
    expect(temCondicao('Concentrando, Caído', 'concentrando')).toBe(true);
    expect(temCondicao('Caído', 'Cego')).toBe(false);
    expect(temCondicao(undefined, 'Cego')).toBe(false);
  });

  it('alternar liga a condição que falta e desliga a que já existe', () => {
    expect(alternarCondicao('Caído', 'Cego')).toBe('Caído, Cego');
    expect(alternarCondicao('Caído, Cego', 'caído')).toBe('Cego');
    expect(alternarCondicao(null, 'Exausto')).toBe('Exausto');
  });

  it('a lista oficial tem as condições do D&D sem repetição', () => {
    expect(new Set(CONDICOES).size).toBe(CONDICOES.length);
    expect(CONDICOES).toContain('Concentrando');
  });
});
