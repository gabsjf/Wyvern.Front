import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Anotacoes } from './anotacoes';
import { Anotacao } from '../../../services/anotacao.service';

const PASTA = { pastaId: 3, campanhaId: 1, nome: 'Sessão 12', isPublica: false };
const NOTA: Anotacao = { anotacaoId: 9, campanhaId: 1, pastaId: 3, titulo: 'Segredos da cripta', conteudo: 'O lich está **acordado**.', isPublica: false, criadoEm: new Date('2026-11-01'), criadoPorId: 0 };

describe('Anotacoes', () => {
  let component: Anotacoes;
  let fixture: ComponentFixture<Anotacoes>;

  // Sem zone.js, mudar o estado direto (sem clique) não marca a tela; o clique de verdade marcaria.
  function redesenhar() {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Anotacoes],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Anotacoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('modo foco: recolhe a lista e lembra a escolha neste aparelho', () => {
    expect(component.listaRecolhida).toBe(false);
    component.alternarLista();
    redesenhar();

    expect(component.listaRecolhida).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.anotacoes')?.classList).toContain('foco');
    expect(localStorage.getItem('wyvern.anotacoes.listaRecolhida')).toBe('1');
  });

  it('pastas abrem e fecham na lista', () => {
    component.pastas = [PASTA];
    component.anotacoes = [NOTA];
    redesenhar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Segredos da cripta');

    component.alternarPasta(3);
    redesenhar();
    expect(component.pastaFechada(3)).toBe(true);
    expect(el.textContent).not.toContain('Segredos da cripta');

    component.alternarPasta(3);
    expect(component.pastaFechada(3)).toBe(false);
  });

  it('a barra da nota mostra a pasta de onde ela vem', async () => {
    component.pastas = [PASTA];
    component.anotacoes = [NOTA];
    component.selecionarAnotacao(NOTA);
    await fixture.whenStable();
    redesenhar();

    expect(component.pastaAtual?.nome).toBe('Sessão 12');
    expect((fixture.nativeElement as HTMLElement).querySelector('.caminho')?.textContent).toContain('Sessão 12');
    expect((fixture.nativeElement as HTMLElement).querySelector('.titulo-leitura')?.textContent).toContain('Segredos da cripta');
  });

  it('Ctrl+S salva só enquanto escreve', () => {
    const salvar = vi.spyOn(component, 'salvarAnotacao').mockImplementation(() => {});
    const ctrlS = () => new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });

    const fora = ctrlS();
    component.aoTeclarEditor(fora);
    expect(salvar).not.toHaveBeenCalled();
    expect(fora.defaultPrevented).toBe(false);

    component.novaAnotacao();
    const dentro = ctrlS();
    component.aoTeclarEditor(dentro);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(dentro.defaultPrevented).toBe(true);
  });
});
