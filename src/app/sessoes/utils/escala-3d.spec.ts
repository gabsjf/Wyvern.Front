import { lerAltura, medidasNaMesa, quadradosPorUnidade, tamanhoDnd } from './escala-3d';

describe('escala das miniaturas (25,4 mm = 1 quadrado = 1,5 m)', () => {
  it('a escala automática reconhece a unidade pela altura', () => {
    expect(lerAltura(32)).toBe('mm');                 // .stl de impressão em mm
    expect(lerAltura(0.032)).toBe('impressaEmMetros'); // .stl já convertido
    expect(lerAltura(1.8)).toBe('realEmMetros');       // .glb de um humano em tamanho real
  });

  it('um humano impresso dá ~1,2 quadrado de altura, em mm ou em metros, e em tamanho real também', () => {
    const emMm = 30 * quadradosPorUnidade('Auto', 30)!;
    const emMetrosDeImpressao = 0.03 * quadradosPorUnidade('Auto', 0.03)!;
    const real = 1.8 * quadradosPorUnidade('Real', 1.8)!;
    for (const q of [emMm, emMetrosDeImpressao, real]) expect(q).toBeGreaterThan(1.1), expect(q).toBeLessThan(1.25);
  });

  it('na automática, modelo de jogo (em metros) cabe no token', () => {
    expect(quadradosPorUnidade('Auto', 1.8)).toBeNull();
    expect(quadradosPorUnidade('Auto', 0.38)).toBeNull(); // o dragão em voo, achatado
    expect(medidasNaMesa({ largura: 3.6, profundidade: 2.48, altura: 0.38 }, 'Auto')).toBeNull();
  });

  it('a escala escolhida vence a dedução', () => {
    expect(quadradosPorUnidade('Real', 30)).toBeCloseTo(1 / 1.524);
    expect(quadradosPorUnidade('Impressao', 1.8)).toBeCloseTo(1000 / 25.4); // 1,8 m "impressos" = gigante: foi escolha
    expect(quadradosPorUnidade('Encaixar', 30)).toBeNull();
  });

  it('o tamanho do D&D sai da largura da base', () => {
    expect(tamanhoDnd(0.5).nome).toBe('Miúdo');
    expect(tamanhoDnd(1).nome).toBe('Pequeno ou Médio');
    expect(tamanhoDnd(1.9)).toEqual({ nome: 'Grande', lado: 2 });
    expect(tamanhoDnd(3)).toEqual({ nome: 'Enorme', lado: 3 });
    expect(tamanhoDnd(4.5)).toEqual({ nome: 'Imenso', lado: 4 });
  });

  it('um ogro impresso de 50 mm de base e 60 mm de altura é Grande, com 2 quadrados de base', () => {
    const m = medidasNaMesa({ largura: 50, profundidade: 45, altura: 60 }, 'Auto')!;
    expect(m.tamanho.nome).toBe('Grande');
    expect(m.largura).toBeCloseTo(50 / 25.4);
    expect(m.alturaMm).toBeCloseTo(60);
  });
});
