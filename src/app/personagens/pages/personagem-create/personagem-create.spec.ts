import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PersonagemCreate } from './personagem-create';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

const CAMPANHAS = [
  { campanhaId: 1, nome: 'Mesa do amigo', papel: 'Jogador' },
  { campanhaId: 2, nome: 'Minha mesa', papel: 'Mestre' },
];

function montar(opcoes: { campanha?: string; id?: string; ficha?: any } = {}) {
  const servico = {
    getPericias: () => of([]),
    getById: vi.fn(() => of(opcoes.ficha)),
    create: vi.fn((_: any) => of({})),
    update: vi.fn((_id: number, _p: any) => of({})),
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
  return { c, servico, toast, navegar };
}

/** O que foi enviado à API na última criação. */
const enviado = (servico: ReturnType<typeof montar>['servico']) => servico.create.mock.calls.at(-1)![0];

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
      c.personagem.nome = 'Lyra';
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
      c.personagem.nome = 'Goblin';
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
      c.personagem.nome = 'Goblin';
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
});
