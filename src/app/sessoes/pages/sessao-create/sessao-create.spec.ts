import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessaoCreate, diaLocal, proximoSabado } from './sessao-create';

const CAMPANHAS = [
  { campanhaId: 1, nome: 'A Queda de Vael', sistema: 'D&D 5e', papel: 'Mestre' },
  { campanhaId: 2, nome: 'Brumavale', sistema: 'Tormenta20', papel: 'Mestre' },
  { campanhaId: 3, nome: 'Mesa do amigo', sistema: 'D&D 5e', papel: 'Jogador' },
];
const SESSOES = [
  { sessaoId: 10, campanhaId: 1, numeroSessao: 3, nome: 'O Portão', dataSessao: '2026-11-01T00:00:00' },
  { sessaoId: 11, campanhaId: 1, numeroSessao: 4, nome: 'A Cripta', dataSessao: '2026-11-08T00:00:00' },
];

function montar(params: { id?: string; campanha?: string } = {}) {
  TestBed.configureTestingModule({
    imports: [SessaoCreate],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(params.id ? { id: params.id } : {}),
            queryParamMap: convertToParamMap(params.campanha ? { campanha: params.campanha } : {}),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SessaoCreate);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  http.expectOne(r => r.url.endsWith('/Campanha')).flush(CAMPANHAS);
  http.expectOne(r => r.method === 'GET' && r.url.endsWith('/Sessao')).flush(SESSOES);
  return { c: fixture.componentInstance, http, router };
}

describe('SessaoCreate', () => {
  it('lista só as campanhas em que o usuário é Mestre', () => {
    const { c } = montar();
    expect(c.campanhas().map(x => x.campanhaId)).toEqual([1, 2]);
    expect(c.campanhaId()).toBe(0);
  });

  it('a campanha da URL já vem escolhida e o número continua a contagem', () => {
    const { c } = montar({ campanha: '1' });
    expect(c.campanhaId()).toBe(1);
    expect(c.numero()).toBe(5);
    expect(c.ultima()?.nome).toBe('A Cripta');
  });

  it('trocar de campanha recalcula o número, a menos que o Mestre o tenha mudado', () => {
    const { c } = montar({ campanha: '1' });
    c.escolherCampanha(2);
    expect(c.numero()).toBe(1);
    c.mudarNumero(7);
    c.escolherCampanha(1);
    expect(c.numero()).toBe(7);
  });

  it('data no futuro vira sessão agendada; hoje ou antes, registro', () => {
    const { c } = montar();
    c.data.set(c.hoje);
    expect(c.agendada()).toBe(false);
    c.data.set('2999-01-01');
    expect(c.agendada()).toBe(true);
    c.data.set('2000-01-01');
    expect(c.agendada()).toBe(false);
    expect(c.sobreData()).toContain('já jogada');
  });

  it('envia a sessão e abre a sessão criada', () => {
    const { c, http, router } = montar({ campanha: '1' });
    c.nome.set('  O Dragão ');
    c.data.set('2999-01-01');
    c.save();

    const req = http.expectOne(r => r.method === 'POST');
    expect(req.request.body).toEqual({
      numeroSessao: 5, nome: 'O Dragão', dataSessao: '2999-01-01', dataAgendada: '2999-01-01', obs: '', campanhaId: 1,
    });
    req.flush({ sessaoId: 99 });
    expect(router.navigate).toHaveBeenCalledWith(['/sessoes', 99]);
  });

  it('mostra o erro da API sem sair da tela', () => {
    const { c, http, router } = montar({ campanha: '1' });
    c.nome.set('Teste');
    c.save();
    http.expectOne(r => r.method === 'POST').flush({ detail: 'Só o Mestre pode criar sessões.' }, { status: 403, statusText: 'Forbidden' });
    expect(c.erro()).toBe('Só o Mestre pode criar sessões.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('na edição carrega a sessão, mantém o número e salva com PUT', () => {
    const { c, http, router } = montar({ id: '11' });
    http.expectOne(r => r.url.endsWith('/Sessao/11')).flush(SESSOES[1]);
    expect(c.editando()).toBe(true);
    expect(c.numero()).toBe(4);
    expect(c.data()).toBe('2026-11-08');
    expect(c.ultima()?.sessaoId).toBe(10); // a própria sessão não conta como "última"

    c.save();
    const req = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/Sessao/11'));
    expect(req.request.body.sessaoId).toBe(11);
    req.flush({});
    expect(router.navigate).toHaveBeenCalledWith(['/sessoes', 11]);
  });
});

describe('datas', () => {
  it('próximo sábado nunca é hoje', () => {
    expect(diaLocal(proximoSabado(new Date(2026, 10, 10)))).toBe('2026-11-14'); // terça
    expect(diaLocal(proximoSabado(new Date(2026, 10, 14)))).toBe('2026-11-21'); // sábado
  });
});
