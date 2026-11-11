import { candidatosPara } from './trazer-heroi';
import { Personagem } from '../../models/personagem';

function p(personagemId: number, nome: string, campanhaId: number, extra: Partial<Personagem> = {}): Personagem {
  return { personagemId, nome, campanhaId, tipoId: 1, criadoPorId: 7, ...extra } as Personagem;
}

describe('candidatosPara', () => {
  const lista = [
    p(1, 'Lyra', 10),
    p(2, 'Thorin', 11),
    p(3, 'Lyra', 20),                       // já trazida para a campanha 20
    p(4, 'Goblin', 10, { tipoId: 3 }),      // monstro: não entra
    p(5, 'Do outro', 10, { criadoPorId: 9 }), // de outra pessoa: não entra
  ];

  it('mostra só os heróis da pessoa que estão em outras campanhas, do mais novo para o mais antigo', () => {
    const nomes = candidatosPara(lista, 20, 7).map(c => c.personagem.personagemId);
    expect(nomes).toEqual([2, 1]);
  });

  it('marca como já trazido quem tem o mesmo nome na campanha de destino', () => {
    const porId = new Map(candidatosPara(lista, 20, 7).map(c => [c.personagem.personagemId, c.jaTrouxe]));
    expect(porId.get(1)).toBe(true);
    expect(porId.get(2)).toBe(false);
  });

  it('sem heróis em outras campanhas, nada para trazer', () => {
    expect(candidatosPara([p(3, 'Lyra', 20)], 20, 7)).toEqual([]);
  });
});
