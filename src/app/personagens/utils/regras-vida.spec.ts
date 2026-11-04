import { alternarCondicao, escreverCondicoes, lerCondicoes, temCondicao } from './condicoes';
import { alternarMarca, aplicarCura, aplicarDano } from './regras-vida';

describe('regras de vida', () => {
  const estado = { vida: 20, maxima: 40, temporarios: 5 };

  describe('dano', () => {
    it('gasta primeiro os PV temporários', () => {
      expect(aplicarDano(estado, 3)).toEqual({ vidaAtual: 20, vidaTemporaria: 2 });
    });

    it('o que passa dos temporários tira dos PV de verdade', () => {
      expect(aplicarDano(estado, 12)).toEqual({ vidaAtual: 13, vidaTemporaria: 0 });
    });

    it('nunca deixa os PV abaixo de zero', () => {
      expect(aplicarDano(estado, 500).vidaAtual).toBe(0);
    });

    it('ignora dano negativo ou quebrado', () => {
      expect(aplicarDano(estado, -4)).toEqual({ vidaAtual: 20, vidaTemporaria: 5 });
      expect(aplicarDano(estado, 2.9)).toEqual({ vidaAtual: 20, vidaTemporaria: 3 });
    });
  });

  describe('cura', () => {
    it('soma aos PV sem tocar nos temporários', () => {
      expect(aplicarCura(estado, 7)).toEqual({ vidaAtual: 27, vidaTemporaria: 5 });
    });

    it('não passa do máximo', () => {
      expect(aplicarCura(estado, 100).vidaAtual).toBe(40);
    });

    it('quem estava em 0 PV e volta a ter PV zera as salvaguardas de morte', () => {
      expect(aplicarCura({ vida: 0, maxima: 40, temporarios: 0 }, 4)).toEqual({
        vidaAtual: 4, vidaTemporaria: 0, deathSaveSucessos: 0, deathSaveFalhas: 0,
      });
    });

    it('quem já estava de pé não mexe nas salvaguardas', () => {
      expect(aplicarCura(estado, 4)).not.toHaveProperty('deathSaveSucessos');
    });

    it('cura zero em quem está em 0 PV não o levanta', () => {
      expect(aplicarCura({ vida: 0, maxima: 40, temporarios: 0 }, 0)).not.toHaveProperty('deathSaveFalhas');
    });
  });

  it('as marcas das salvaguardas marcam até a clicada e desmarcam a última', () => {
    expect(alternarMarca(0, 2)).toBe(2);
    expect(alternarMarca(2, 3)).toBe(3);
    expect(alternarMarca(3, 3)).toBe(2);
    expect(alternarMarca(1, 1)).toBe(0);
  });
});

describe('condições', () => {
  it('lê o texto sem vazios e sem repetidos', () => {
    expect(lerCondicoes('Envenenado,  caído ;; Envenenado, ')).toEqual(['Envenenado', 'caído']);
    expect(lerCondicoes(null)).toEqual([]);
    expect(lerCondicoes('')).toEqual([]);
  });

  it('escreve a lista separada por vírgula', () => {
    expect(escreverCondicoes(['Cego', 'Surdo'])).toBe('Cego, Surdo');
  });

  it('liga e desliga uma condição, sem diferenciar maiúsculas', () => {
    expect(alternarCondicao('Cego', 'Surdo')).toBe('Cego, Surdo');
    expect(alternarCondicao('Cego, Surdo', 'cego')).toBe('Surdo');
    expect(alternarCondicao('', 'Caído')).toBe('Caído');
  });

  it('sabe se uma condição está ativa', () => {
    expect(temCondicao('Cego, Surdo', 'surdo')).toBe(true);
    expect(temCondicao('Cego', 'Surdo')).toBe(false);
    expect(temCondicao(undefined, 'Surdo')).toBe(false);
  });
});
