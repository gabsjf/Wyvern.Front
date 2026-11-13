import {
  XP_POR_ND, acharClasse, bonusDeAtaque, previaDaAcao, bonusDeProficienciaPorNd, bonusDeProficienciaPorNivel, camposObrigatorios,
  faltasParaCriar, modificador, pvSugerido, temBlocoDeCombate,
} from './regras-da-ficha';

const atributos = (v: number | null = 10) => ({ forca: v, destreza: v, constituicao: v, inteligencia: v, sabedoria: v, carisma: v });
const combate = { vidaMaxima: 12, classeArmadura: 15, deslocamento: '9m' };

const heroi = (extra: any = {}) => ({
  nome: 'Lyra', campanhaId: 1, tipoId: 1,
  personagemPlayer: { classe: 'Mago', raca: 'Elfo', antecedente: 'Sábio', nivel: 1, subclasse: '' },
  atributo: atributos(), personagemCombate: combate, ...extra,
});

const campos = (p: any) => faltasParaCriar(p).map(f => f.campo);

describe('regras da ficha (WYV-35)', () => {
  it('herói completo pode ser criado', () => {
    expect(faltasParaCriar(heroi())).toEqual([]);
  });

  it('herói sem origem, atributos e combate lista tudo o que falta, cada um na sua aba', () => {
    const faltas = faltasParaCriar({ nome: 'Lyra', campanhaId: 1, tipoId: 1, personagemPlayer: { nivel: 1 }, atributo: atributos(null), personagemCombate: {} });
    expect(faltas.map(f => f.campo)).toEqual(['classe', 'raca', 'antecedente', 'atributos', 'vidaMaxima', 'classeArmadura', 'deslocamento']);
    expect(faltas.find(f => f.campo === 'raca')!.aba).toBe('basico');
    expect(faltas.find(f => f.campo === 'atributos')!.aba).toBe('atributos');
  });

  it('nome e campanha são sempre pedidos', () => {
    expect(campos({ nome: '  ', campanhaId: 0, tipoId: 2, personagemNpc: { categoriaUso: 'Narrativo' } })).toEqual(['nome', 'campanhaId']);
  });

  it('nível vai de 1 a 20 e a subclasse entra a partir do 3', () => {
    expect(campos(heroi({ personagemPlayer: { ...heroi().personagemPlayer, nivel: 0 } }))).toContain('nivel');
    expect(campos(heroi({ personagemPlayer: { ...heroi().personagemPlayer, nivel: 21 } }))).toContain('nivel');
    expect(campos(heroi({ personagemPlayer: { ...heroi().personagemPlayer, nivel: 2 } }))).toEqual([]);
    expect(campos(heroi({ personagemPlayer: { ...heroi().personagemPlayer, nivel: 3 } }))).toEqual(['subclasse']);
  });

  it('atributo fora de 1 a 30 é recusado', () => {
    const f = faltasParaCriar(heroi({ atributo: { ...atributos(), forca: 31 } }));
    expect(f.map(x => x.mensagem)).toContain('Cada atributo vai de 1 a 30.');
  });

  it('NPC narrativo só precisa de nome e campanha', () => {
    expect(faltasParaCriar({ nome: 'Taverneiro', campanhaId: 1, tipoId: 2, personagemNpc: { categoriaUso: 'Narrativo' } })).toEqual([]);
  });

  it('NPC de combate, vilão e monstro precisam do bloco de estatísticas', () => {
    for (const p of [
      { tipoId: 2, personagemNpc: { categoriaUso: 'Inimigo' } },
      { tipoId: 2, personagemNpc: { categoriaUso: 'Vilao' } },
      { tipoId: 3, personagemNpc: { categoriaUso: 'Narrativo' } }, // monstro sempre luta
    ]) {
      expect(campos({ nome: 'X', campanhaId: 1, ...p })).toEqual(
        ['tamanho', 'tipoCriatura', 'nivelDesafio', 'atributos', 'vidaMaxima', 'classeArmadura', 'deslocamento']);
    }
    const goblin = { nome: 'Goblin', campanhaId: 1, tipoId: 3, personagemNpc: { tamanho: 'Pequeno', tipoCriatura: 'Fada', nivelDesafio: '1/4' }, atributo: atributos(), personagemCombate: combate };
    expect(faltasParaCriar(goblin)).toEqual([]);
    expect(campos({ ...goblin, personagemNpc: { ...goblin.personagemNpc, nivelDesafio: '40' } })).toEqual(['nivelDesafio']);
  });

  it('bloco de combate: monstro, ou NPC de combate ou vilão', () => {
    expect(temBlocoDeCombate(3, undefined)).toBe(true);
    expect(temBlocoDeCombate(2, 'Vilao')).toBe(true);
    expect(temBlocoDeCombate(2, 'Narrativo')).toBe(false);
    expect(temBlocoDeCombate(1, 'Inimigo')).toBe(false);
  });

  it('obrigatórios por tipo, para marcar os rótulos', () => {
    expect(camposObrigatorios(1, null, 1).has('subclasse')).toBe(false);
    expect(camposObrigatorios(1, null, 5).has('subclasse')).toBe(true);
    expect(camposObrigatorios(2, 'Narrativo').has('atributos')).toBe(false);
    expect(camposObrigatorios(2, 'Vilao').has('nivelDesafio')).toBe(true);
  });

  it('XP e proficiência pelo ND, proficiência pelo nível', () => {
    expect(XP_POR_ND['1/4']).toBe(50);
    expect(XP_POR_ND['5']).toBe(1800);
    expect(['0', '4', '5', '8', '9', '17', '30'].map(bonusDeProficienciaPorNd)).toEqual([2, 2, 3, 3, 4, 6, 9]);
    expect([1, 4, 5, 9, 13, 17, 20].map(bonusDeProficienciaPorNivel)).toEqual([2, 2, 3, 4, 5, 6, 6]);
  });

  it('modificador e PV pelo valor fixo', () => {
    expect([1, 8, 10, 11, 15, 30].map(modificador)).toEqual([-5, -1, 0, 0, 2, 10]);
    expect(modificador(null)).toBeNull();
    expect(pvSugerido(10, 1, 14)).toBe(12);   // guerreiro nv 1, CON 14: 10 + 2
    expect(pvSugerido(10, 3, 14)).toBe(28);   // + 2 × (6 + 2)
    expect(pvSugerido(6, 2, 3)).toBe(3);      // CON 3 (−4): 2 no 1º nível e o mínimo de 1 no 2º
  });

  it('acha a classe sem acento e no feminino', () => {
    expect(acharClasse('Maga')?.dadoVida).toBe(6);
    expect(acharClasse('barbara')?.dadoVida).toBe(12);
    expect(acharClasse('Guerreira')?.nome).toBe('Guerreiro');
    expect(acharClasse('Artífice')).toBeUndefined();
  });
});

describe('ações do bloco de estatísticas', () => {
  it('bônus de acerto: modificador do atributo + proficiência', () => {
    expect(bonusDeAtaque(16, true, 2)).toBe(5);
    expect(bonusDeAtaque(16, false, 2)).toBe(3);
    expect(bonusDeAtaque(null, true, 2)).toBeNull();
  });

  it('prévia de ataque no estilo do bloco', () => {
    expect(previaDaAcao({ tipoAcao: 'Ataque', bonusAcerto: 4, alcance: '1,5 m', dano: '1d8+3', tipoDano: 'Cortante' }))
      .toBe('Jogada de ataque: +4, alcance 1,5 m. Acerto: 1d8+3 de dano cortante.');
    expect(previaDaAcao({ tipoAcao: 'Ataque', bonusAcerto: null, dano: '', descricao: 'Derruba o alvo.' }))
      .toBe('Jogada de ataque. Derruba o alvo.');
  });

  it('magia e habilidade mostram a descrição', () => {
    expect(previaDaAcao({ tipoAcao: 'Magia', descricao: 'Cone de 4,5 m, salvaguarda de DES CD 13.' })).toBe('Cone de 4,5 m, salvaguarda de DES CD 13.');
    expect(previaDaAcao({ tipoAcao: 'Habilidade' })).toBe('—');
  });
});
