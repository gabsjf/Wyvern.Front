import { TestBed } from '@angular/core/testing';
import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  beforeEach(() => localStorage.clear());

  it('começa com a barra aberta e lembra quando a pessoa recolhe', () => {
    const layout = TestBed.inject(LayoutService);
    expect(layout.recolhida()).toBe(false);

    layout.alternar();

    expect(layout.recolhida()).toBe(true);
    expect(localStorage.getItem('wyvern.sidebar.recolhida')).toBe('1');
  });

  it('abre já recolhida se foi assim que a pessoa deixou', () => {
    localStorage.setItem('wyvern.sidebar.recolhida', '1');
    expect(new LayoutService().recolhida()).toBe(true);
  });

  it('o modo imersivo começa desligado', () => {
    expect(TestBed.inject(LayoutService).imersivo()).toBe(false);
  });

  it('o botão voltar fecha a camada de cima primeiro', () => {
    const layout = TestBed.inject(LayoutService);
    const fechadas: string[] = [];
    layout.abrirCamada(() => fechadas.push('dados'));
    layout.abrirCamada(() => fechadas.push('confirmação'));

    expect(layout.fecharCamadaDoTopo()).toBe(true);
    expect(layout.fecharCamadaDoTopo()).toBe(true);
    expect(layout.fecharCamadaDoTopo()).toBe(false);
    expect(fechadas).toEqual(['confirmação', 'dados']);
  });

  it('camada solta (fechada pela tela) não é fechada de novo pelo voltar', () => {
    const layout = TestBed.inject(LayoutService);
    let fechou = false;
    const soltar = layout.abrirCamada(() => (fechou = true));

    soltar();

    expect(layout.fecharCamadaDoTopo()).toBe(false);
    expect(fechou).toBe(false);
  });
});
