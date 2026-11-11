import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { SessaoList } from './sessao-list';
import { PaginaDeSessoes, SessaoService } from '../../services/sessao.service';
import { PapelService } from '../../../campaigns/services/papel.service';
import { Sessao } from '../../models/sessao';

const sessao = (sessaoId: number, campanhaId: number, numeroSessao: number, nome: string): Sessao =>
  ({ sessaoId, campanhaId, numeroSessao, nome: `S${numeroSessao}`, dataSessao: '2026-11-01', campanha: { nome } });

/** Bruma tem 10 sessões e Vael 5; a ordem do servidor é Bruma, depois Vael. */
const POR_CAMPANHA = [{ campanhaId: 1, nome: 'Bruma', total: 10 }, { campanhaId: 2, nome: 'Vael', total: 5 }];

function pagina(numero: number, itens: Sessao[]): PaginaDeSessoes {
  return { itens, total: 15, pagina: numero, tamanhoPagina: 12, totalPaginas: 2, porCampanha: POR_CAMPANHA };
}

function montar(query: Record<string, string> = {}, resposta = pagina(1, [])) {
  const getPagina = vi.fn((_p: number, _c: number | null) => of(resposta));
  TestBed.configureTestingModule({
    imports: [SessaoList],
    providers: [
      provideRouter([]),
      { provide: SessaoService, useValue: { getPagina } },
      { provide: PapelService, useValue: { ehMestreEmAlguma: () => of(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SessaoList);
  fixture.detectChanges();
  return { c: fixture.componentInstance, getPagina, navegar, el: fixture.nativeElement as HTMLElement };
}

describe('SessaoList', () => {
  it('abre na página e na campanha da URL', () => {
    const { getPagina } = montar({ pagina: '2', campanha: '1' });
    expect(getPagina).toHaveBeenCalledWith(2, 1);
  });

  it('agrupa a página por campanha e mostra o total de cada uma (não só o da página)', () => {
    const { c } = montar({}, pagina(1, [sessao(10, 1, 10, 'Bruma'), sessao(9, 1, 9, 'Bruma')]));
    expect(c.porCampanha.map(g => [g.nome, g.sessoes.length])).toEqual([['Bruma', 2]]);
    expect(c.totalDaCampanha(1)).toBe(10);
  });

  it('na página 1 nenhum grupo é continuação', () => {
    const itens = [...Array.from({ length: 10 }, (_, i) => sessao(100 + i, 1, 10 - i, 'Bruma')), sessao(200, 2, 5, 'Vael'), sessao(201, 2, 4, 'Vael')];
    const { c } = montar({}, pagina(1, itens));
    expect(c.porCampanha.map(g => g.continuacao)).toEqual([false, false]);
  });

  it('na página 2, a campanha que começou na página anterior aparece como continuação', () => {
    const itens = [sessao(202, 2, 3, 'Vael'), sessao(203, 2, 2, 'Vael'), sessao(204, 2, 1, 'Vael')];
    const { c, el } = montar({ pagina: '2' }, pagina(2, itens));
    expect(c.porCampanha[0].continuacao).toBe(true);
    expect(el.textContent).toContain('(continuação)');
    // a "Mais recente" já ficou na página anterior
    expect(el.textContent).not.toContain('Mais recente');
  });

  it('filtrar por campanha volta para a página 1 e guarda o filtro na URL', () => {
    const { c, getPagina, navegar } = montar({ pagina: '2' });
    c.alternarCampanha(2);
    expect(getPagina).toHaveBeenLastCalledWith(1, 2);
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { campanha: 2, pagina: null } }));
  });

  it('com filtro, o grupo da campanha filtrada nunca é continuação de outra', () => {
    const { c } = montar({ campanha: '2', pagina: '2' }, pagina(2, [sessao(1, 2, 1, 'Vael')]));
    // com filtro a lista começa na própria campanha: a página 2 continua o que veio antes dela
    expect(c.porCampanha[0].continuacao).toBe(true);
  });

  it('só quem é Mestre em alguma campanha vê "Nova sessão"', () => {
    const { el } = montar();
    expect(el.querySelector('a[href="/sessoes/create"]')).not.toBeNull();
  });
});
