import { escolherCampanha } from './anotacoes-pagina';
import { Campaign } from '../../models/campaign';

const LISTA: Campaign[] = [
  { campanhaId: 7, nome: 'Mesa do amigo', papel: 'Jogador' },
  { campanhaId: 5, nome: 'A Queda de Vael', papel: 'Mestre' },
  { campanhaId: 2, nome: 'Brumavale', papel: 'Mestre' },
];

describe('escolherCampanha', () => {
  it('abre a campanha do link quando a pessoa participa dela', () => {
    expect(escolherCampanha(LISTA, 2, 5)).toBe(2);
  });

  it('ignora um link de campanha alheia e cai na última aberta', () => {
    expect(escolherCampanha(LISTA, 99, 7)).toBe(7);
  });

  it('sem link nem última, abre a mais recente em que é Mestre', () => {
    expect(escolherCampanha(LISTA, 0, 0)).toBe(5);
  });

  it('sem nenhuma como Mestre, abre a primeira; sem campanhas, nenhuma', () => {
    expect(escolherCampanha([LISTA[0]], 0, 0)).toBe(7);
    expect(escolherCampanha([], 0, 0)).toBeNull();
  });
});
