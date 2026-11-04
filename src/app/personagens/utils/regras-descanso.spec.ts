import {
  curaTotal, dadosDeVida, modConstituicao, resultadoCurto, resultadoLongo, rolarDadosDeVida, temEspacosDeMagia,
} from './regras-descanso';

/** Personagem nível 5, 40 PV (25 atuais), 5d10 de dados de vida com 3 gastos, CON 14 (+2). */
function guerreiro(extra: any = {}): any {
  return {
    atributo: { constituicao: 14 },
    personagemPlayer: { nivel: 5 },
    personagemCombate: { vidaMaxima: 40, vidaAtual: 25, dadoVidaMaximo: '5d10', dadoVidaGasto: 3, vidaTemporaria: 4, deathSaveSucessos: 1, deathSaveFalhas: 2 },
    ...extra,
  };
}

describe('regras de descanso', () => {
  describe('dados de vida', () => {
    it('lê quantidade e faces de "5d10"', () => {
      expect(dadosDeVida(guerreiro())).toEqual({ faces: 10, total: 5, gasto: 3, disponiveis: 2 });
    });

    it('sem quantidade ("d8") o total é o nível', () => {
      const p = guerreiro({ personagemCombate: { dadoVidaMaximo: 'd8', dadoVidaGasto: 0 } });
      expect(dadosDeVida(p)).toEqual({ faces: 8, total: 5, gasto: 0, disponiveis: 5 });
    });

    it('sem texto, não há faces para rolar mas o total ainda é o nível', () => {
      const p = guerreiro({ personagemCombate: { dadoVidaMaximo: null } });
      expect(dadosDeVida(p).faces).toBe(0);
      expect(dadosDeVida(p).total).toBe(5);
    });

    it('nunca fica com dados disponíveis negativos', () => {
      const p = guerreiro({ personagemCombate: { dadoVidaMaximo: '2d10', dadoVidaGasto: 5 } });
      expect(dadosDeVida(p).disponiveis).toBe(0);
    });
  });

  it('modificador de Constituição: 14 vale +2, 8 vale -1, ausente vale 0', () => {
    expect(modConstituicao(guerreiro())).toBe(2);
    expect(modConstituicao({ atributo: { constituicao: 8 } })).toBe(-1);
    expect(modConstituicao({})).toBe(0);
  });

  it('só tem espaços de magia quem tem algum máximo maior que zero', () => {
    expect(temEspacosDeMagia(guerreiro())).toBe(false);
    expect(temEspacosDeMagia(guerreiro({ personagemConjuracao: { slotsNivel1Max: 0 } }))).toBe(false);
    expect(temEspacosDeMagia(guerreiro({ personagemConjuracao: { slotsNivel3Max: 2 } }))).toBe(true);
  });

  describe('rolagem do descanso curto', () => {
    it('cada dado cura a face mais o modificador de Constituição', () => {
      const sorteios = [0.0, 0.5, 0.99]; // faces 1, 6 e 10 em um d10
      const rolagens = rolarDadosDeVida(3, 10, 2, () => sorteios.shift()!);

      expect(rolagens.map(r => r.face)).toEqual([1, 6, 10]);
      expect(rolagens.map(r => r.cura)).toEqual([3, 8, 12]);
      expect(curaTotal(rolagens)).toBe(23);
    });

    it('um dado nunca cura menos que zero, mesmo com modificador negativo', () => {
      const [r] = rolarDadosDeVida(1, 10, -3, () => 0); // face 1, 1 - 3 = -2
      expect(r.cura).toBe(0);
    });

    it('a face fica sempre entre 1 e o número de faces', () => {
      for (const r of rolarDadosDeVida(200, 6, 0)) {
        expect(r.face).toBeGreaterThanOrEqual(1);
        expect(r.face).toBeLessThanOrEqual(6);
      }
    });

    it('quantidade zero ou negativa não rola nada', () => {
      expect(rolarDadosDeVida(0, 10, 2)).toEqual([]);
      expect(rolarDadosDeVida(-2, 10, 2)).toEqual([]);
    });
  });

  describe('resultado do descanso curto', () => {
    it('soma a cura aos PV e conta os dados gastos', () => {
      const r = resultadoCurto(guerreiro(), 2, 14);
      expect(r).toMatchObject({ tipo: 'Curto', vidaAtual: 39, dadoVidaGasto: 5 });
    });

    it('não passa do máximo de PV', () => {
      expect(resultadoCurto(guerreiro(), 2, 99).vidaAtual).toBe(40);
    });

    it('mantém os PV temporários e as salvaguardas de quem continua inconsciente', () => {
      const p = guerreiro({ personagemCombate: { vidaMaxima: 40, vidaAtual: 0, dadoVidaMaximo: '5d10', dadoVidaGasto: 0, vidaTemporaria: 4, deathSaveSucessos: 1, deathSaveFalhas: 2 } });
      const r = resultadoCurto(p, 0, 0);
      expect(r).toMatchObject({ vidaAtual: 0, vidaTemporaria: 4, deathSaveSucessos: 1, deathSaveFalhas: 2 });
    });

    it('quem volta a ter PV zera as salvaguardas de morte', () => {
      const p = guerreiro({ personagemCombate: { vidaMaxima: 40, vidaAtual: 0, dadoVidaMaximo: '5d10', dadoVidaGasto: 0, deathSaveSucessos: 2, deathSaveFalhas: 1 } });
      expect(resultadoCurto(p, 1, 7)).toMatchObject({ vidaAtual: 7, deathSaveSucessos: 0, deathSaveFalhas: 0 });
    });

    it('só restaura espaços de magia quando pedido', () => {
      expect(resultadoCurto(guerreiro(), 0, 0).restaurarEspacosMagia).toBe(false);
      expect(resultadoCurto(guerreiro(), 0, 0, true).restaurarEspacosMagia).toBe(true);
    });
  });

  describe('resultado padrão do descanso longo', () => {
    it('volta a todos os PV, zera os temporários e as salvaguardas', () => {
      expect(resultadoLongo(guerreiro())).toMatchObject({
        tipo: 'Longo', vidaAtual: 40, vidaTemporaria: 0, deathSaveSucessos: 0, deathSaveFalhas: 0,
      });
    });

    it('recupera metade do total de dados de vida, arredondando para baixo', () => {
      // total 5 → recupera 2; gastos 3 → 1
      expect(resultadoLongo(guerreiro()).dadoVidaGasto).toBe(1);
    });

    it('recupera pelo menos 1 dado, mesmo com total 1', () => {
      const p = guerreiro({ personagemCombate: { vidaMaxima: 10, dadoVidaMaximo: '1d8', dadoVidaGasto: 1 } });
      expect(resultadoLongo(p).dadoVidaGasto).toBe(0);
    });

    it('nunca deixa os dados gastos negativos', () => {
      const p = guerreiro({ personagemCombate: { vidaMaxima: 40, dadoVidaMaximo: '5d10', dadoVidaGasto: 1 } });
      expect(resultadoLongo(p).dadoVidaGasto).toBe(0);
    });

    it('restaura espaços de magia só de quem os tem', () => {
      expect(resultadoLongo(guerreiro()).restaurarEspacosMagia).toBe(false);
      expect(resultadoLongo(guerreiro({ personagemConjuracao: { slotsNivel1Max: 4 } })).restaurarEspacosMagia).toBe(true);
    });
  });
});
