import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PersonagemList } from './personagem-list';
import { PaginaDePersonagens, PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { PapelService } from '../../../campaigns/services/papel.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Personagem } from '../../models/personagem';

const MEU_ID = 7;

const RESPOSTA: PaginaDePersonagens = {
  itens: [
    { personagemId: 1, nome: 'Lyra', campanhaId: 2, campanhaNome: 'Vael', tipoId: 1, criadoPorId: MEU_ID } as Personagem,
    { personagemId: 2, nome: 'Thorin', campanhaId: 2, campanhaNome: 'Vael', tipoId: 1, criadoPorId: 9, criadoPorNome: 'Bruno' } as Personagem,
  ],
  total: 2, pagina: 1, tamanhoPagina: 12, totalPaginas: 1,
  totalHerois: 2, totalMonstros: 5,
  porCampanha: [{ campanhaId: 2, nome: 'Vael', total: 2 }],
};

function montar(query: Record<string, string> = {}) {
  const getPagina = vi.fn((_f: any) => of(RESPOSTA));
  TestBed.configureTestingModule({
    imports: [PersonagemList],
    providers: [
      provideRouter([]),
      { provide: PersonagemService, useValue: { getPagina } },
      { provide: CampaignService, useValue: { getAll: () => of([{ campanhaId: 2, nome: 'Vael', papel: 'Mestre' }]) } },
      { provide: PapelService, useValue: { ehMestreEmAlguma: () => of(true) } },
      { provide: AuthService, useValue: { usuarioLogado: () => ({ usuarioId: MEU_ID }) } },
      { provide: ToastService, useValue: { ok: vi.fn(), erro: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PersonagemList);
  fixture.detectChanges();
  return { c: fixture.componentInstance, getPagina, navegar, el: fixture.nativeElement as HTMLElement };
}

describe('PersonagemList', () => {
  it('abre com a aba, a busca, a campanha e a página da URL', () => {
    const { getPagina } = montar({ aba: 'monstros', busca: 'gob', campanha: '2', pagina: '3' });
    expect(getPagina).toHaveBeenCalledWith({ pagina: 3, tipo: 'monstros', busca: 'gob', campanhaId: 2 });
  });

  it('as abas mostram os totais que vêm do servidor', () => {
    const { c, el } = montar();
    expect(c.contar('herois')).toBe(2);
    expect(c.contar('monstros')).toBe(5);
    expect(el.querySelectorAll('.carta')).toHaveLength(2);
  });

  it('trocar de aba limpa o filtro de campanha e volta para a página 1', () => {
    const { c, getPagina } = montar({ campanha: '2', pagina: '2' });
    c.setTab('monstros');
    expect(getPagina).toHaveBeenLastCalledWith({ pagina: 1, tipo: 'monstros', busca: '', campanhaId: null });
  });

  it('clicar na mesma aba não recarrega', () => {
    const { c, getPagina } = montar();
    c.setTab('herois');
    expect(getPagina).toHaveBeenCalledTimes(1);
  });

  it('filtro de campanha liga e desliga', () => {
    const { c, getPagina } = montar();
    c.alternarCampanha(2);
    expect(getPagina).toHaveBeenLastCalledWith(expect.objectContaining({ campanhaId: 2, pagina: 1 }));
    c.alternarCampanha(2);
    expect(getPagina).toHaveBeenLastCalledWith(expect.objectContaining({ campanhaId: null }));
  });

  it('busca espera a pessoa parar de digitar', () => {
    vi.useFakeTimers();
    try {
      const { c, getPagina } = montar();
      c.buscar('ly');
      c.buscar('lyra');
      expect(getPagina).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(300);
      expect(getPagina).toHaveBeenCalledTimes(2);
      expect(getPagina).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'lyra', pagina: 1 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('diz de quem é cada personagem', () => {
    const { c } = montar();
    expect(c.donoDe(RESPOSTA.itens[0])).toBe('Seu personagem');
    expect(c.donoDe(RESPOSTA.itens[1])).toBe('Bruno');
    expect(c.donoDe({ ...RESPOSTA.itens[1], tipoId: 3 } as Personagem)).toBe('Criado por Bruno');
    expect(c.donoDe({ ...RESPOSTA.itens[1], criadoPorNome: '' } as Personagem)).toBe('Jogador desconhecido');
  });

  it('o tipo aparece como Herói, NPC ou Monstro', () => {
    const { c } = montar();
    expect([1, 2, 3].map(tipoId => c.rotuloTipo({ tipoId } as Personagem))).toEqual(['Herói', 'NPC', 'Monstro']);
  });
});
