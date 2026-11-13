import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { DashboardComponent } from './dashboard';
import { DashboardSummary } from '../../models/dashboard-summary';

const VAEL = { campanhaId: 2, nome: 'A Queda de Vael', sistema: 'D&D 5e', ativo: true, mestreNome: 'Ana', papel: 'Mestre' as const, totalSessoes: 4, totalHerois: 3 };

function resumo(mudancas: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    totalCampanhas: 9, totalSessoes: 4, totalHerois: 3, totalNpcs: 1, totalViloes: 2,
    destaque: VAEL,
    ultimaSessaoDoDestaque: { sessaoId: 40, numeroSessao: 4, nome: 'A Cripta', dataSessao: '2026-11-08T00:00:00', campanhaId: 2, campanhaNome: VAEL.nome },
    ultimasCampanhas: [VAEL],
    proximasSessoes: [],
    sessoesRecentes: [{ sessaoId: 40, numeroSessao: 4, nome: 'A Cripta', dataSessao: '2026-11-08T00:00:00', campanhaId: 2, campanhaNome: VAEL.nome }],
    herois: [{ personagemId: 7, nome: 'Thorin', campanhaId: 2, campanhaNome: VAEL.nome }],
    ...mudancas,
  };
}

function montar() {
  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(DashboardComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('DashboardComponent', () => {
  it('monta o painel com uma chamada só', () => {
    const { fixture, http, el } = montar();
    http.expectOne(r => r.url.endsWith('/Dashboard/resumo')).flush(resumo());
    http.verify(); // nada de baixar as listas inteiras de campanhas, sessões e personagens
    fixture.detectChanges();

    expect(el.querySelector('.destaque-nome')?.textContent).toContain('A Queda de Vael');
    expect(el.textContent).toContain('Jogar sessão 4');
    expect(el.textContent).toContain('Sessões recentes');
    expect(el.textContent).toContain('Ver todas (9)');
    expect(el.querySelector('.lista-herois')?.textContent).toContain('Thorin');
  });

  it('com sessão agendada, mostra as próximas no lugar das recentes', () => {
    const { fixture, http, el } = montar();
    http.expectOne(r => r.url.endsWith('/Dashboard/resumo')).flush(resumo({
      proximasSessoes: [{ sessaoId: 41, numeroSessao: 5, nome: 'O Portão', dataSessao: '2026-11-20T00:00:00', dataAgendada: '2026-11-20T00:00:00', campanhaId: 2, campanhaNome: VAEL.nome }],
    }));
    fixture.detectChanges();

    expect(el.textContent).toContain('Próximas sessões');
    expect(el.querySelector('.lista-sessoes')?.textContent).toContain('O Portão');
  });

  it('sem campanha, mostra o começo da jornada', () => {
    const { fixture, http, el } = montar();
    http.expectOne(r => r.url.endsWith('/Dashboard/resumo')).flush(resumo({
      totalCampanhas: 0, destaque: null, ultimaSessaoDoDestaque: null, ultimasCampanhas: [], sessoesRecentes: [], herois: [],
    }));
    fixture.detectChanges();

    expect(el.textContent).toContain('Sua primeira aventura');
    expect(el.querySelector('.lista-herois')).toBeNull();
  });

  it('se o resumo falhar, oferece tentar de novo', () => {
    const { fixture, http, el } = montar();
    http.expectOne(r => r.url.endsWith('/Dashboard/resumo')).flush('erro', { status: 500, statusText: 'Erro' });
    fixture.detectChanges();

    const botao = el.querySelector<HTMLButtonElement>('.alert-error button');
    expect(botao).not.toBeNull();
    botao!.click();
    http.expectOne(r => r.url.endsWith('/Dashboard/resumo'));
  });
});
