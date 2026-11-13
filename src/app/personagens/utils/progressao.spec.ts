import { XP_POR_NIVEL, barraDeXp } from './progressao';

describe('barraDeXp', () => {
  it('a tabela do D&D 2024 tem os 20 níveis e só cresce', () => {
    expect(XP_POR_NIVEL).toHaveLength(20);
    for (let i = 1; i < XP_POR_NIVEL.length; i++) expect(XP_POR_NIVEL[i]).toBeGreaterThan(XP_POR_NIVEL[i - 1]);
  });

  it('mostra quanto falta para o próximo nível', () => {
    expect(barraDeXp(1, 150)).toEqual({ xp: 150, inicio: 0, fim: 300, pct: 50 });
    expect(barraDeXp(3, 900).pct).toBe(0);
  });

  it('não passa de 0 a 100, mesmo com XP fora da faixa do nível', () => {
    expect(barraDeXp(2, 100).pct).toBe(0);
    expect(barraDeXp(2, 5000).pct).toBe(100);
  });

  it('no nível 20 a barra fica cheia e não há próximo nível', () => {
    expect(barraDeXp(20, 400000)).toMatchObject({ fim: null, pct: 100 });
  });

  it('nível inválido vira 1; acima de 20 vira 20', () => {
    expect(barraDeXp(0, 0).fim).toBe(300);
    expect(barraDeXp(25, 0).fim).toBeNull();
  });
});
