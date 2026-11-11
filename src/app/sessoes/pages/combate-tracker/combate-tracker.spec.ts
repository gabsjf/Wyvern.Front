import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { CombateTracker } from './combate-tracker';
import { CombateService } from '../../services/combate.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { PapelService } from '../../../campaigns/services/papel.service';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

function montar() {
  const combate = {
    getActiveCombatBySessao: vi.fn(() => of(null)),
    startConnection: vi.fn(),
    startSessaoConnection: vi.fn(),
    stopConnection: vi.fn(),
    stopSessaoConnection: vi.fn(),
    nextTurn: vi.fn(() => of({})),
    updateParticipante: vi.fn(() => of({})),
    endCombate: vi.fn(() => of({})),
    startCombate: vi.fn(),
  };
  const toast = { info: vi.fn(), ok: vi.fn(), erro: vi.fn() };
  TestBed.configureTestingModule({
    imports: [CombateTracker],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CombateService, useValue: combate },
      { provide: PersonagemService, useValue: { getAll: () => of([]) } },
      { provide: PapelService, useValue: { papelNaCampanha: () => of('Mestre') } },
      { provide: MesaService, useValue: { rolar: vi.fn() } },
      { provide: ToastService, useValue: toast },
    ],
  });
  const c = TestBed.createComponent(CombateTracker).componentInstance;
  return { c, combate, toast };
}

/** Combate com três participantes; o índice 0 está na vez. */
function emCombate(c: CombateTracker, participantes: any[], turno = 0, rodada = 1) {
  c.combateAtivo = { combateId: 4, turnoAtualIndex: turno, rodadaAtual: rodada };
  c.participantesCombate = participantes;
}

const heroi = (extra: any = {}) => ({ participanteId: 1, nomeNPC: 'Lyra', isInimigo: false, vidaAtual: 20, vidaMaxima: 20, sucessosMorte: 0, falhasMorte: 0, ...extra });
const goblin = (extra: any = {}) => ({ participanteId: 2, nomeNPC: 'Goblin', isInimigo: true, vidaAtual: 7, vidaMaxima: 7, ...extra });

describe('CombateTracker', () => {
  describe('passar o turno', () => {
    it('vai para o próximo e avisa o servidor uma vez', () => {
      const { c, combate } = montar();
      emCombate(c, [heroi(), goblin(), heroi({ participanteId: 3 })]);

      c.proximoTurno();

      expect(c.combateAtivo.turnoAtualIndex).toBe(1);
      expect(c.combateAtivo.rodadaAtual).toBe(1);
      expect(combate.nextTurn).toHaveBeenCalledExactlyOnceWith(4);
    });

    it('depois do último, volta ao primeiro e começa outra rodada', () => {
      const { c } = montar();
      emCombate(c, [heroi(), goblin()], 1, 2);

      c.proximoTurno();

      expect(c.combateAtivo.turnoAtualIndex).toBe(0);
      expect(c.combateAtivo.rodadaAtual).toBe(3);
    });

    it('pula o monstro abatido e o herói com três falhas', () => {
      const { c } = montar();
      emCombate(c, [heroi(), goblin({ vidaAtual: 0 }), heroi({ participanteId: 3, falhasMorte: 3 }), goblin({ participanteId: 4 })]);

      c.proximoTurno();

      expect(c.combateAtivo.turnoAtualIndex).toBe(3);
    });

    it('herói caído (0 PV, sem 3 falhas) ainda tem vez: é quando rola a salvaguarda', () => {
      const { c } = montar();
      emCombate(c, [goblin(), heroi({ vidaAtual: 0, falhasMorte: 1 })]);

      c.proximoTurno();

      expect(c.combateAtivo.turnoAtualIndex).toBe(1);
    });

    it('com todos fora de combate, dá uma volta e para, sem travar', () => {
      const { c } = montar();
      emCombate(c, [goblin({ vidaAtual: 0 }), goblin({ participanteId: 3, vidaAtual: 0 })]);

      c.proximoTurno();

      expect(c.combateAtivo.turnoAtualIndex).toBe(0);
    });

    it('libera de novo a salvaguarda de morte para quem entra na vez', () => {
      const { c } = montar();
      emCombate(c, [heroi(), goblin()]);
      c.turnDeathSaveModified = true;

      c.proximoTurno();

      expect(c.turnDeathSaveModified).toBe(false);
    });
  });

  describe('dano e cura', () => {
    it('dano não deixa a vida abaixo de zero e salva no servidor', () => {
      const { c, combate } = montar();
      emCombate(c, []);
      const g = goblin();

      c.aplicarDano(g, '10', false);

      expect(g.vidaAtual).toBe(0);
      expect(combate.updateParticipante).toHaveBeenCalledWith(4, 2, expect.objectContaining({ vidaAtual: 0 }));
    });

    it('cura não passa do máximo e tira o herói das salvaguardas de morte', () => {
      const { c } = montar();
      const h = heroi({ vidaAtual: 0, sucessosMorte: 2, falhasMorte: 1 });

      c.aplicarDano(h, '50', true);

      expect(h.vidaAtual).toBe(20);
      expect(h.sucessosMorte).toBe(0);
      expect(h.falhasMorte).toBe(0);
    });

    it('valor vazio, zero ou negativo não faz nada', () => {
      const { c, combate } = montar();
      emCombate(c, []);
      const g = goblin();
      for (const v of ['', 'abc', '0', '-3']) c.aplicarDano(g, v, false);

      expect(g.vidaAtual).toBe(7);
      expect(combate.updateParticipante).not.toHaveBeenCalled();
    });

    it('dano em quem está concentrando lembra o teste de Constituição com a CD certa', () => {
      const { c, toast } = montar();
      const h = heroi({ vidaAtual: 40, vidaMaxima: 40, condicoes: 'Concentrando' });

      c.aplicarDano(h, '8', false);
      c.aplicarDano(h, '26', false);

      expect(toast.info).toHaveBeenNthCalledWith(1, expect.stringContaining('CD 10'));
      expect(toast.info).toHaveBeenNthCalledWith(2, expect.stringContaining('CD 13'));
    });

    it('quem cai a zero não recebe o lembrete de concentração', () => {
      const { c, toast } = montar();
      c.aplicarDano(heroi({ vidaAtual: 5, condicoes: 'Concentrando' }), '9', false);
      expect(toast.info).not.toHaveBeenCalled();
    });
  });

  describe('salvaguardas de morte', () => {
    it('só uma marcação por turno, e só na vez do personagem', () => {
      const { c } = montar();
      const h = heroi({ vidaAtual: 0 });

      c.toggleSucessoMorte(h, 1, false);
      expect(h.sucessosMorte).toBe(0);

      c.toggleSucessoMorte(h, 1, true);
      c.toggleFalhaMorte(h, 1, true);
      expect(h.sucessosMorte).toBe(1);
      expect(h.falhasMorte).toBe(0);
    });

    it('clicar de novo na mesma marca desfaz e libera outra marcação', () => {
      const { c } = montar();
      const h = heroi({ vidaAtual: 0 });

      c.toggleFalhaMorte(h, 1, true);
      c.toggleFalhaMorte(h, 1, true);
      expect(h.falhasMorte).toBe(0);
      expect(c.turnDeathSaveModified).toBe(false);
    });

    it('três sucessos estabilizam o herói com 1 PV', () => {
      const { c } = montar();
      const h = heroi({ vidaAtual: 0, sucessosMorte: 2 });

      c.toggleSucessoMorte(h, 3, true);

      expect(h.vidaAtual).toBe(1);
      expect(h.sucessosMorte).toBe(0);
      expect(h.falhasMorte).toBe(0);
    });

    it('com três falhas não há mais o que marcar', () => {
      const { c } = montar();
      const h = heroi({ vidaAtual: 0, falhasMorte: 3 });

      c.toggleSucessoMorte(h, 1, true);

      expect(h.sucessosMorte).toBe(0);
      expect(c.estaMorto(h)).toBe(true);
    });
  });

  describe('preparar o combate', () => {
    const goblinDaFicha = { personagemId: 9, nome: 'Goblin', tipoId: 3, personagemCombate: { vidaMaxima: 7, classeArmadura: 15, iniciativa: 2 }, personagemNpc: { formulaDadoVida: '2d6' } };

    it('monstro entra em cópias numeradas, com PV fixo quando o sorteio está desligado', () => {
      const { c } = montar();
      c.sortearPv = false;
      c.ajustarQuantidade(goblinDaFicha, 2);

      c.adicionarComQuantidade(goblinDaFicha);

      expect(c.participantesSelecionados.map(p => p.nome)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
      expect(c.participantesSelecionados.every(p => p.vidaAtual === 7 && p.isInimigo && p.classeArmadura === 15)).toBe(true);
      expect(c.quantidadeDe(goblinDaFicha)).toBe(1); // volta a 1 para a próxima vez
    });

    it('PV sorteado fica dentro da fórmula do monstro', () => {
      const { c } = montar();
      c.ajustarQuantidade(goblinDaFicha, 19);
      c.adicionarComQuantidade(goblinDaFicha);

      expect(c.participantesSelecionados).toHaveLength(20); // no máximo 20 cópias de uma vez
      for (const p of c.participantesSelecionados) {
        expect(p.vidaAtual).toBeGreaterThanOrEqual(2);
        expect(p.vidaAtual).toBeLessThanOrEqual(12);
      }
    });

    it('herói entra uma vez só, com a vida da ficha', () => {
      const { c } = montar();
      const lyra = { personagemId: 1, nome: 'Lyra', tipoId: 1, personagemCombate: { vidaAtual: 12, vidaMaxima: 20 } };

      c.adicionarComQuantidade(lyra);
      c.adicionarComQuantidade(lyra);

      expect(c.participantesSelecionados).toHaveLength(1);
      expect(c.participantesSelecionados[0]).toMatchObject({ vidaAtual: 12, vidaMaxima: 20, isInimigo: false });
    });

    it('o bônus de iniciativa vem da ficha ou, sem ele, da Destreza', () => {
      const { c } = montar();
      expect(c.bonusIniciativa({ personagemCombate: { iniciativa: 4 } })).toBe(4);
      expect(c.bonusIniciativa({ atributo: { destreza: 15 } })).toBe(2);
      expect(c.bonusIniciativa({ atributo: { destreza: 7 } })).toBe(-2);
      expect(c.bonusIniciativa({})).toBe(0);
    });

    it('NPC rápido entra como inimigo e o formulário volta ao padrão', () => {
      const { c } = montar();
      c.novoNpc = { nome: 'Bandido', vidaMaxima: 11, classeArmadura: 12, iniciativa: 14 };

      c.adicionarNpcRapido();

      expect(c.participantesSelecionados[0]).toMatchObject({ nome: 'Bandido', vidaAtual: 11, isInimigo: true, iniciativa: 14 });
      expect(c.novoNpc.nome).toBe('');
    });
  });

  describe('o que cada um vê e pode fazer', () => {
    it('jogador só age nos próprios personagens; o Mestre, em todos', () => {
      const { c } = montar();
      c.personagensMeusIds = [5];
      c.userRole = 'Jogador';
      expect(c.podeAgir({ personagemId: 5 })).toBe(true);
      expect(c.podeAgir({ personagemId: 6 })).toBe(false);

      c.userRole = 'Mestre';
      expect(c.podeAgir({ personagemId: 6 })).toBe(true);
    });

    it('quem não controla o personagem vê só um estado da vida, sem números', () => {
      const { c } = montar();
      const estado = (vidaAtual: number, isInimigo = true) => c.obterStatusVida({ vidaAtual, vidaMaxima: 100, isInimigo }).text;

      expect(estado(80)).toBe('Saudável');
      expect(estado(50)).toBe('Machucado');
      expect(estado(20)).toBe('Muito machucado');
      expect(estado(10)).toBe('Quase morto');
      expect(estado(0)).toBe('Abatido');
      expect(estado(0, false)).toBe('Caído / inconsciente');
    });
  });
});
