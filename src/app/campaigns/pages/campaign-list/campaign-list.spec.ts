import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CampaignList } from './campaign-list';
import { CampanhaNaLista } from '../../models/campaign';
import { Pagina } from '../../../shared/models/pagina';

function campanha(id: number): CampanhaNaLista {
  return { campanhaId: id, nome: `Campanha ${id}`, sistema: 'D&D 5e', ativo: true, mestreNome: 'Ana', papel: 'Mestre', totalSessoes: id, totalHerois: 2 };
}

function pagina(numero: number, total: number, tamanho = 12): Pagina<CampanhaNaLista> {
  const inicio = (numero - 1) * tamanho;
  const itens = Array.from({ length: Math.max(0, Math.min(tamanho, total - inicio)) }, (_, i) => campanha(total - inicio - i));
  return { itens, total, pagina: numero, tamanhoPagina: tamanho, totalPaginas: Math.ceil(total / tamanho) };
}

function montar(query: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [CampaignList],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(CampaignList);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, http, navegar, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('CampaignList', () => {
  it('pede só a primeira página e mostra os números da capa', () => {
    const { fixture, http, el } = montar();
    const req = http.expectOne(r => r.url.endsWith('/Campanha/pagina'));
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(pagina(1, 3));
    http.verify(); // sem as listas inteiras de sessões e personagens só para contar
    fixture.detectChanges();

    expect(el.querySelectorAll('.tomo:not(.tomo-novo)').length).toBe(3);
    expect(el.querySelector('.tomo-numeros')?.textContent).toContain('3');
    expect(el.querySelector('app-paginacao nav')).toBeNull(); // cabe numa página
  });

  it('abre na página da URL e guarda a página nova ao navegar', () => {
    const { fixture, http, navegar, c } = montar({ pagina: '2' });
    const primeira = http.expectOne(r => r.url.endsWith('/Campanha/pagina'));
    expect(primeira.request.params.get('pagina')).toBe('2');
    primeira.flush(pagina(2, 30));
    fixture.detectChanges();

    c.irPara(3);
    http.expectOne(r => r.params.get('pagina') === '3').flush(pagina(3, 30));
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { pagina: 3, busca: null }, replaceUrl: true }));
  });

  it('o cartão de nova campanha só aparece na última página', () => {
    const { fixture, http, c, el } = montar();
    http.expectOne(r => r.url.endsWith('/Campanha/pagina')).flush(pagina(1, 30));
    fixture.detectChanges();
    expect(el.querySelector('.tomo-novo')).toBeNull();

    c.irPara(3);
    http.expectOne(r => r.params.get('pagina') === '3').flush(pagina(3, 30));
    fixture.detectChanges();
    expect(c.mostraCartaoNovo).toBe(true);
  });

  it('busca no servidor depois de uma pausa na digitação e volta para a página 1', () => {
    vi.useFakeTimers();
    try {
      const { http, c } = montar({ pagina: '2' });
      http.expectOne(r => r.url.endsWith('/Campanha/pagina')).flush(pagina(2, 30));

      c.buscar('va');
      c.buscar('vael');
      vi.advanceTimersByTime(300);

      const req = http.expectOne(r => r.params.get('busca') === 'vael');
      expect(req.request.params.get('pagina')).toBe('1');
      http.verify(); // "va" não chegou a ir
    } finally {
      vi.useRealTimers();
    }
  });

  it('pediu uma página que não existe mais: volta para a última', () => {
    const { http } = montar({ pagina: '5' });
    http.expectOne(r => r.params.get('pagina') === '5').flush({ itens: [], total: 13, pagina: 5, tamanhoPagina: 12, totalPaginas: 2 });
    http.expectOne(r => r.params.get('pagina') === '2');
  });
});
