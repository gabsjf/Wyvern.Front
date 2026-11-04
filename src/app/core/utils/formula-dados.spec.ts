import { analisarFormula, formulaD20, sortearFaces, totalDaRolagem } from './formula-dados';

describe('fórmulas de dados', () => {
  describe('analisarFormula', () => {
    it('lê dados com modificador', () => {
      expect(analisarFormula('1d20+5')).toEqual({ termos: [{ quantidade: 1, faces: 20, sinal: 1 }], modificador: 5 });
    });

    it('aceita "d8" sem quantidade, espaços e maiúsculas', () => {
      expect(analisarFormula(' D8 - 1 ')).toEqual({ termos: [{ quantidade: 1, faces: 8, sinal: 1 }], modificador: -1 });
    });

    it('soma vários termos e constantes', () => {
      const f = analisarFormula('4d6+2+1')!;
      expect(f.termos).toEqual([{ quantidade: 4, faces: 6, sinal: 1 }]);
      expect(f.modificador).toBe(3);
    });

    it('guarda o sinal de dados subtraídos', () => {
      expect(analisarFormula('2d6-1d4')!.termos).toEqual([
        { quantidade: 2, faces: 6, sinal: 1 },
        { quantidade: 1, faces: 4, sinal: -1 },
      ]);
    });

    it.each(['', '   ', 'abc', '1d', 'd', '5', '+', '1d20+', '1d20++5', '0d6', '1d1', '2x6', '1d20 5'])('recusa "%s"', texto => {
      expect(analisarFormula(texto)).toBeNull();
    });

    it('recusa quantidade e faces absurdas', () => {
      expect(analisarFormula('61d6')).toBeNull();
      expect(analisarFormula('1d1001')).toBeNull();
      expect(analisarFormula('1d1000')).not.toBeNull();
    });
  });

  it('formulaD20 escreve o bônus com sinal', () => {
    expect(formulaD20(5)).toBe('1d20+5');
    expect(formulaD20(-1)).toBe('1d20-1');
    expect(formulaD20(0)).toBe('1d20');
  });

  describe('sorteio e total', () => {
    it('sorteia uma face por dado, sempre dentro do limite', () => {
      const faces = sortearFaces(analisarFormula('3d6+1d4')!);
      expect(faces).toHaveLength(4);
      faces.slice(0, 3).forEach(f => { expect(f).toBeGreaterThanOrEqual(1); expect(f).toBeLessThanOrEqual(6); });
      expect(faces[3]).toBeLessThanOrEqual(4);
    });

    it('é determinístico com um sorteio fixo', () => {
      expect(sortearFaces(analisarFormula('2d10')!, () => 0.5)).toEqual([6, 6]);
      expect(sortearFaces(analisarFormula('1d20')!, () => 0.999)).toEqual([20]);
    });

    it('o total soma as faces e o modificador', () => {
      expect(totalDaRolagem(analisarFormula('1d20+5')!, [12])).toBe(17);
      expect(totalDaRolagem(analisarFormula('2d6-1')!, [3, 4])).toBe(6);
    });

    it('termos subtraídos descontam do total', () => {
      expect(totalDaRolagem(analisarFormula('2d6-1d4')!, [3, 4, 2])).toBe(5);
    });
  });
});
