import { TestBed } from '@angular/core/testing';
import { Paginacao, paginasVisiveis } from './paginacao';

describe('paginasVisiveis', () => {
  it('mostra todas quando são poucas', () => {
    expect(paginasVisiveis(1, 1)).toEqual([1]);
    expect(paginasVisiveis(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('no começo, no meio e no fim mostra a vizinhança da atual, a primeira e a última', () => {
    expect(paginasVisiveis(1, 12)).toEqual([1, 2, 3, 4, 5, 'reticencias', 12]);
    expect(paginasVisiveis(6, 12)).toEqual([1, 'reticencias', 5, 6, 7, 'reticencias', 12]);
    expect(paginasVisiveis(12, 12)).toEqual([1, 'reticencias', 8, 9, 10, 11, 12]);
  });

  it('sempre inclui a página atual', () => {
    for (let atual = 1; atual <= 20; atual++) expect(paginasVisiveis(atual, 20)).toContain(atual);
  });
});

describe('Paginacao', () => {
  function montar(pagina: number, totalPaginas: number, total = totalPaginas * 12) {
    TestBed.configureTestingModule({ imports: [Paginacao] });
    const fixture = TestBed.createComponent(Paginacao);
    fixture.componentRef.setInput('pagina', pagina);
    fixture.componentRef.setInput('totalPaginas', totalPaginas);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('tamanhoPagina', 12);
    fixture.detectChanges();
    const emitidas: number[] = [];
    fixture.componentInstance.mudar.subscribe(p => emitidas.push(p));
    return { el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance, emitidas };
  }

  it('some quando tudo cabe numa página', () => {
    const { el } = montar(1, 1, 5);
    expect(el.querySelector('nav')).toBeNull();
  });

  it('mostra o intervalo e marca a página atual', () => {
    const { el } = montar(2, 3, 30);
    expect(el.textContent).toContain('13–24 de 30');
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
  });

  it('avisa a página escolhida e não sai dos limites', () => {
    const { c, emitidas } = montar(1, 3);
    c.ir(0);
    c.ir(1);
    c.ir(2);
    c.ir(4);
    expect(emitidas).toEqual([2]);
  });
});
