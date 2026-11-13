import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PersonagemCreate } from './personagem-create';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Modelos3dService } from '../../../sessoes/services/modelos3d.service';

const CAMPANHAS = [
  { campanhaId: 1, nome: 'Mesa do amigo', papel: 'Jogador' },
  { campanhaId: 2, nome: 'Minha mesa', papel: 'Mestre' },
];

function montar(opcoes: { campanha?: string; id?: string; ficha?: any } = {}) {
  const servico = {
    getPericias: () => of([]),
    getById: vi.fn(() => of(opcoes.ficha)),
    create: vi.fn((_: any) => of({ personagemId: 42 })),
    update: vi.fn((_id: number, _p: any) => of({})),
  };
  const modelos = {
    biblioteca: vi.fn(async () => ({ modelos: [{ modeloId: 5, nome: 'Elfa', categoria: 'Miniatura' }, { modeloId: 6, nome: 'Árvore', categoria: 'Cenario' }], espacoUsado: 0, espacoTotal: 1, tamanhoMaximoArquivo: 1 })),
    definirMiniatura: vi.fn(async (_p: number, _m: number | null) => ({})),
    enviar: vi.fn(),
    arquivo: vi.fn(),
  };
  const toast = { ok: vi.fn(), erro: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule(); // alguns testes montam a tela mais de uma vez
  TestBed.configureTestingModule({
    imports: [PersonagemCreate],
    providers: [
      provideRouter([]),
      { provide: PersonagemService, useValue: servico },
      { provide: CampaignService, useValue: { getAll: () => of(CAMPANHAS) } },
      { provide: AuthService, useValue: { usuarioLogado: () => null } },
      { provide: ToastService, useValue: toast },
      { provide: Modelos3dService, useValue: modelos },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(opcoes.id ? { id: opcoes.id } : {}),
            queryParamMap: convertToParamMap(opcoes.campanha ? { campanha: opcoes.campanha } : {}),
          },
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const c = TestBed.createComponent(PersonagemCreate).componentInstance;
  c.ngOnInit();
  return { c, servico, toast, navegar, modelos };
}

/** O que foi enviado à API na última criação. */
const enviado = (servico: ReturnType<typeof montar>['servico']) => servico.create.mock.calls.at(-1)![0];

/** Preenche o que as regras pedem para o tipo atual (WYV-35). */
function completar(c: PersonagemCreate, nome = 'Lyra') {
  const p = c.personagem;
  p.nome = nome;
  Object.assign(p.atributo, { forca: 10, destreza: 14, constituicao: 12, inteligencia: 15, sabedoria: 10, carisma: 8 });
  Object.assign(p.personagemCombate, { vidaMaxima: 8, classeArmadura: 12, deslocamento: '9m' });
  Object.assign(p.personagemPlayer, { classe: 'Mago', raca: 'Elfo', antecedente: 'Sábio', nivel: 1 });
  Object.assign(p.personagemNpc, { tamanho: 'Pequeno', tipoCriatura: 'Humanoide', nivelDesafio: '1/4' });
}

describe('PersonagemCreate', () => {
  describe('campanha e tipo', () => {
    it('sem indicação, abre na campanha em que a pessoa é Mestre', () => {
      expect(montar().c.personagem.campanhaId).toBe(2);
    });

    it('?campanha= escolhe a campanha do convite, se a pessoa participa dela', () => {
      expect(montar({ campanha: '1' }).c.personagem.campanhaId).toBe(1);
      expect(montar({ campanha: '99' }).c.personagem.campanhaId).toBe(2);
    });

    it('NPC e Monstro só para o Mestre da campanha; herói qualquer um cria', () => {
      const { c } = montar({ campanha: '1' });
      c.escolherTipo(3);
      expect(c.personagem.tipoId).toBe(1);

      c.personagem.campanhaId = 2;
      c.escolherTipo(3);
      expect(c.personagem.tipoId).toBe(3);
    });

    it('trocar para uma campanha em que não é Mestre volta o tipo para Herói', () => {
      const { c } = montar();
      c.escolherTipo(2);
      c.personagem.campanhaId = 1;
      c.aoMudarCampanha();
      expect(c.personagem.tipoId).toBe(1);
    });
  });

  describe('salvar', () => {
    it('sem nome, avisa e volta para a aba Básico sem chamar a API', () => {
      const { c, servico, toast } = montar();
      c.setTab('combate');
      c.save();
      expect(servico.create).not.toHaveBeenCalled();
      expect(c.activeTab).toBe('basico');
      expect(toast.erro).toHaveBeenCalledWith(expect.stringContaining('nome'));
    });

    it('sem campanha, avisa', () => {
      const { c, servico, toast } = montar();
      c.personagem.nome = 'Lyra';
      c.personagem.campanhaId = 0;
      c.save();
      expect(servico.create).not.toHaveBeenCalled();
      expect(toast.erro).toHaveBeenCalledWith(expect.stringContaining('campanha'));
    });

    it('herói novo começa com vida cheia e espaços de magia cheios, sem os campos de NPC', () => {
      const { c, servico, navegar } = montar();
      completar(c);
      c.personagem.personagemCombate.vidaMaxima = 18;
      c.personagem.personagemCombate.vidaAtual = 3;
      c.personagem.personagemConjuracao.slotsNivel1Max = 4;

      c.save();

      const p = enviado(servico);
      expect(p.personagemCombate.vidaAtual).toBe(18);
      expect(p.personagemConjuracao.slotsNivel1Atual).toBe(4);
      expect(p.personagemNpc).toBeNull();
      expect(p.personagemPlayer).not.toBeNull();
      expect(navegar).toHaveBeenCalledWith(['/personagens']);
    });

    it('monstro vai sem os campos de jogador e sem ações vazias', () => {
      const { c, servico } = montar();
      completar(c, 'Goblin');
      c.escolherTipo(3);
      c.addAcaoPadrao();
      c.addAcaoPadrao();
      c.personagem.personagemAcoesPadrao[0].nome = 'Cimitarra';
      c.personagem.personagemAcoesPadrao[0].bonusAcerto = '4';

      c.save();

      const p = enviado(servico);
      expect(p.personagemPlayer).toBeNull();
      expect(p.personagemAcoesPadrao).toHaveLength(1);
      expect(p.personagemAcoesPadrao[0].bonusAcerto).toBe(4);
    });

    it('ação de ataque vira ataque na ficha uma vez só, mesmo salvando de novo', () => {
      const { c, servico } = montar();
      completar(c, 'Goblin');
      c.escolherTipo(3);
      c.addAcaoPadrao();
      c.personagem.personagemAcoesPadrao[0].nome = 'Mordida';

      c.save();
      c.isSaving = false;
      c.save();

      expect(enviado(servico).personagemAtaques.filter((a: any) => a.nome === 'Mordida')).toHaveLength(1);
    });

    it('não salva duas vezes enquanto a primeira está em andamento', () => {
      const { c, servico } = montar();
      c.personagem.nome = 'Lyra';
      c.isSaving = true;
      c.save();
      expect(servico.create).not.toHaveBeenCalled();
    });
  });

  describe('obrigatórios por tipo (WYV-35)', () => {
    it('herói incompleto não é criado: avisa o que falta, vai para a aba e destaca os campos', () => {
      const { c, servico, toast } = montar();
      c.personagem.nome = 'Lyra';
      Object.assign(c.personagem.personagemPlayer, { classe: 'Mago', raca: 'Elfo', antecedente: 'Sábio' });

      c.save();

      expect(servico.create).not.toHaveBeenCalled();
      expect(c.activeTab).toBe('atributos');
      expect(toast.erro).toHaveBeenCalledWith(expect.stringContaining('seis atributos'));
      expect(c.falta('atributos')).toBe(true);
      expect(c.falta('classe')).toBe(false);
    });

    it('NPC narrativo é criado só com o nome, sem a aba de atributos', () => {
      const { c, servico } = montar();
      c.escolherTipo(2);
      c.escolherCategoria('Narrativo');
      c.personagem.nome = 'Taverneiro';

      expect(c.abasVisiveis.map(a => a.id)).toEqual(['basico', 'detalhes']);
      c.save();
      expect(enviado(servico).personagemNpc.categoriaUso).toBe('Narrativo');
    });

    it('vilão pede o bloco de estatísticas, como monstro', () => {
      const { c, servico } = montar();
      c.escolherTipo(2);
      c.escolherCategoria('Vilao');
      c.personagem.nome = 'Capitão Vex';

      expect(c.obrig('nivelDesafio')).toBe(true);
      expect(c.abasVisiveis.map(a => a.id)).toContain('acoes');
      c.save();
      expect(servico.create).not.toHaveBeenCalled();

      completar(c, 'Capitão Vex');
      c.save();
      expect(enviado(servico).personagemNpc.categoriaUso).toBe('Vilao');
    });

    it('NPC narrativo que vira monstro passa a ter bloco de combate', () => {
      const { c } = montar();
      c.escolherTipo(2);
      c.escolherCategoria('Narrativo');
      c.escolherTipo(3);
      expect(c.comBloco).toBe(true);
    });

    it('o ND preenche o XP e a proficiência', () => {
      const { c } = montar();
      c.escolherTipo(3);
      c.personagem.personagemNpc.nivelDesafio = '5';
      c.aoMudarNd();
      expect(c.personagem.personagemNpc.xpConcedido).toBe(1800);
      expect(c.personagem.personagemCombate.proficienciaBonus).toBe(3);
    });

    it('a classe traz salvaguardas, dados de vida, conjuração e a sugestão de PV', () => {
      const { c } = montar();
      c.personagem.personagemPlayer.classe = 'Guerreira';
      c.personagem.personagemPlayer.nivel = 5;
      c.aoMudarClasse();

      expect(c.personagem.atributo.proficienciaSalvaguardaForca).toBe(true);
      expect(c.personagem.atributo.proficienciaSalvaguardaCarisma).toBe(false);
      expect(c.personagem.personagemCombate.dadoVidaMaximo).toBe('5d10');
      expect(c.personagem.personagemCombate.proficienciaBonus).toBe(3);
      expect(c.personagem.personagemConjuracao.atributoConjuracao).toBe('Nenhum');

      c.usarArranjoPadrao();
      expect(c.personagem.atributo.forca).toBe(15);
      expect(c.personagem.atributo.constituicao).toBe(14);
      expect(c.pvDaRegra).toBe(10 + 2 + 4 * (6 + 2));
    });

    it('traços vazios são descartados; os com nome vão para a API', () => {
      const { c, servico } = montar();
      completar(c, 'Lobo');
      c.escolherTipo(3);
      c.addTracoEspecial();
      c.addTracoEspecial();
      c.personagem.personagemTracosEspeciais[1].nome = 'Táticas de Matilha';

      c.save();

      expect(enviado(servico).personagemTracosEspeciais).toEqual([{ nome: 'Táticas de Matilha', descricao: '' }]);
    });

    it('sugere o bônus de acerto pela ficha da criatura', () => {
      const { c } = montar();
      completar(c, 'Lobo');
      c.escolherTipo(3);
      c.personagem.personagemCombate.proficienciaBonus = 2;
      c.addAcaoPadrao();
      const mordida = c.personagem.personagemAcoesPadrao[0];
      mordida.atributoBase = 'Destreza'; // DES 14 (+2)

      expect(c.bonusDaFicha(mordida)).toEqual({ valor: 4, texto: '+4' });
      mordida.proficiente = false;
      expect(c.bonusDaFicha(mordida)!.valor).toBe(2);
    });

    it('editar uma ficha antiga incompleta continua possível', () => {
      const { c, servico } = montar({ id: '9', ficha: { personagemId: 9, nome: 'Antiga', campanhaId: 2, tipoId: 1, personagemPlayer: { nivel: 1 } } });
      c.save();
      expect(servico.update).toHaveBeenCalled();
    });
  });

  describe('editar', () => {
    const ficha = {
      personagemId: 7, nome: 'Lyra', campanhaId: 1, tipoId: 1,
      personagemPlayer: { classe: 'Maga', nivel: 3 },
      personagemCombate: { vidaMaxima: 20, vidaAtual: 9 },
      personagemPericias: [{ periciaId: 4 }, { periciaId: 6 }],
    };

    it('carrega a ficha e as perícias marcadas', () => {
      const { c } = montar({ id: '7', ficha });
      expect(c.isEditMode).toBe(true);
      expect(c.personagem.nome).toBe('Lyra');
      expect(c.selectedPericiasIds).toEqual([4, 6]);
    });

    it('jogador editando o próprio herói tem nível, classe e PV máximo travados', () => {
      const { c } = montar({ id: '7', ficha });
      expect(c.travarNivel).toBe(true);
    });

    it('preserva a vida atual; se o máximo baixar, a vida acompanha', () => {
      const { c, servico } = montar({ id: '7', ficha });
      c.save();
      expect(servico.update.mock.calls[0][1].personagemCombate.vidaAtual).toBe(9);

      c.isSaving = false;
      c.personagem.personagemCombate.vidaMaxima = 6;
      c.save();
      expect(servico.update.mock.calls[1][1].personagemCombate.vidaAtual).toBe(6);
    });

    it('marcar e desmarcar perícias', () => {
      const { c } = montar();
      c.togglePericia(3);
      c.togglePericia(5);
      c.togglePericia(3);
      expect(c.selectedPericiasIds).toEqual([5]);
    });
  });

  describe('miniatura 3D (WYV-26)', () => {
    it('lista só as miniaturas da biblioteca da campanha', async () => {
      const { c, modelos } = montar();
      await c.carregarMiniaturas();
      expect(modelos.biblioteca).toHaveBeenCalledWith(2);
      expect(c.miniaturas.map(m => m.nome)).toEqual(['Elfa']);
    });

    it('na edição, escolher a miniatura grava na hora', async () => {
      const { c, modelos, toast } = montar({ id: '7', ficha: { personagemId: 7, nome: 'Lyra', campanhaId: 2, tipoId: 1, modeloId: null } });
      await c.escolherMiniatura(5);
      expect(modelos.definirMiniatura).toHaveBeenCalledWith(7, 5);
      expect(c.miniaturaId).toBe(5);
      expect(toast.ok).toHaveBeenCalled();
    });

    it('na edição, se o servidor recusar, volta a miniatura anterior', async () => {
      const { c, modelos } = montar({ id: '7', ficha: { personagemId: 7, nome: 'Lyra', campanhaId: 2, tipoId: 1, modeloId: 5 } });
      modelos.definirMiniatura.mockRejectedValueOnce({ error: { message: 'Não.' } });
      await c.escolherMiniatura(null);
      expect(c.miniaturaId).toBe(5);
    });

    it('na criação, a miniatura vai depois que o personagem existe', async () => {
      const { c, modelos } = montar();
      completar(c);
      await c.escolherMiniatura(5);
      expect(modelos.definirMiniatura).not.toHaveBeenCalled();

      c.save();

      expect(modelos.definirMiniatura).toHaveBeenCalledWith(42, 5);
    });

    it('trocar de campanha na criação limpa a miniatura escolhida', async () => {
      const { c } = montar();
      await c.escolherMiniatura(5);
      c.personagem.campanhaId = 1;
      c.aoMudarCampanha();
      expect(c.miniaturaId).toBeNull();
    });
  });
});
