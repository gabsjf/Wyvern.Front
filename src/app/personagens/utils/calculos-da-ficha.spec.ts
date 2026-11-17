import {
  PERICIAS, bonusDeAtaque, bonusDeMagia, bonusDePericia, bonusDeSalvaguarda, cdDeMagia, danoDoAtaque, ehConjurador, espacosDeMagia,
  iniciativa, mod, sinal,
} from './calculos-da-ficha';

const guerreira = {
  atributo: { forca: 16, destreza: 14, constituicao: 12, inteligencia: 10, sabedoria: 13, carisma: 8, proficienciaSalvaguardaForca: true },
  personagemCombate: { proficienciaBonus: 2, iniciativa: 0 },
  personagemPericias: [{ pericia: { nome: 'Atletismo' } }],
};

describe('cálculos da ficha', () => {
  it('modificador e sinal', () => {
    expect([mod(10), mod(15), mod(8), mod(null)]).toEqual([0, 2, -1, 0]);
    expect([sinal(3), sinal(0), sinal(-2)]).toEqual(['+3', '+0', '-2']);
  });

  it('iniciativa: a gravada na ficha ou o modificador de Destreza', () => {
    expect(iniciativa(guerreira)).toBe(2);
    expect(iniciativa({ ...guerreira, personagemCombate: { iniciativa: 5 } })).toBe(5);
  });

  it('ataque soma atributo, proficiência e bônus da arma; o dano leva o atributo', () => {
    const espada = { atributoBase: 'Forca', proficiente: true, bonusAcerto: 1, dano: '1d8' };
    expect(bonusDeAtaque(guerreira, espada)).toBe(6);
    expect(danoDoAtaque(guerreira, espada)).toBe('1d8+3');
    expect(danoDoAtaque(guerreira, { dano: '1d4' })).toBe('1d4');
  });

  it('perícia e salvaguarda só somam a proficiência quando ela existe', () => {
    const atletismo = PERICIAS.find(p => p.nome === 'Atletismo')!;
    const furtividade = PERICIAS.find(p => p.nome === 'Furtividade')!;
    expect(bonusDePericia(guerreira, atletismo)).toBe(5);
    expect(bonusDePericia(guerreira, furtividade)).toBe(2);
    expect(bonusDeSalvaguarda(guerreira, 'forca')).toBe(5);
    expect(bonusDeSalvaguarda(guerreira, 'carisma')).toBe(-1);
  });

  it('magia: CD e ataque pelo atributo de conjuração; quem não conjura fica com CD 10', () => {
    const maga = { ...guerreira, atributo: { ...guerreira.atributo, inteligencia: 18 }, personagemConjuracao: { atributoConjuracao: 'Inteligencia' } };
    expect(ehConjurador(maga)).toBe(true);
    expect(bonusDeMagia(maga)).toBe(6);
    expect(cdDeMagia(maga)).toBe(14);
    expect(ehConjurador(guerreira)).toBe(false);
    expect(cdDeMagia(guerreira)).toBe(10);
  });

  it('espaços de magia: só os círculos que a ficha tem', () => {
    const p = { personagemConjuracao: { slotsNivel1Max: 4, slotsNivel1Atual: 2, slotsNivel2Max: 2, slotsNivel2Atual: 2 } };
    expect(espacosDeMagia(p)).toEqual([{ nivel: 1, atual: 2, maximo: 4 }, { nivel: 2, atual: 2, maximo: 2 }]);
    expect(espacosDeMagia({})).toEqual([]);
  });
});
