import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { InviteComponent } from './invite';
import { CampaignService } from '../../services/campaign';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Personagem } from '../../../personagens/models/personagem';

function montar(token: string | null, join: () => any) {
  TestBed.configureTestingModule({
    imports: [InviteComponent],
    providers: [
      provideRouter([]),
      { provide: CampaignService, useValue: { join: vi.fn(join), getById: () => of({ campanhaId: 5, nome: 'A Queda de Vael' }) } },
      { provide: PersonagemService, useValue: { getAll: () => of([]) } },
      { provide: AuthService, useValue: { usuarioLogado: () => ({ usuarioId: 7 }) } },
      { provide: ToastService, useValue: { ok: vi.fn(), erro: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(token ? { token } : {}) } } },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(InviteComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, fixture, el: fixture.nativeElement as HTMLElement, navegar };
}

const erroHttp = (status: number, error: unknown = null) => throwError(() => ({ status, error }));

describe('InviteComponent', () => {
  it('entra na campanha e pergunta com qual herói a pessoa vai jogar', () => {
    const { c, el } = montar('tk', () => of({ campanhaId: 5 }));
    expect(c.status()).toBe('success');
    expect(el.querySelector('h1')?.textContent).toContain('A Queda de Vael');
    expect(el.textContent).toContain('Com quem você vai jogar?');
    expect(el.querySelector('a[href="/personagens/create?campanha=5"]')).not.toBeNull();
  });

  it('não volta sozinha para a lista: "Escolher depois" leva à campanha', () => {
    const { c, navegar } = montar('tk', () => of({ campanhaId: 5 }));
    c.irParaCampanha();
    expect(navegar).toHaveBeenCalledWith(['/campaigns', 5]);
  });

  it('depois de trazer um herói, oferece abrir a ficha dele', () => {
    const { c, fixture, el } = montar('tk', () => of({ campanhaId: 5 }));
    c.aoTrazer({ personagemId: 42, nome: 'Lyra' } as Personagem);
    fixture.detectChanges();
    expect(el.textContent).toContain('Lyra já está na mesa');
    expect(el.querySelector('a[href="/ficha/42"]')).not.toBeNull();
  });

  it('sem token no link, nem tenta entrar', () => {
    const join = vi.fn();
    const { c } = montar(null, join);
    expect(c.status()).toBe('error');
    expect(c.message()).toContain('incompleto');
  });

  it.each([
    [404, null, 'não é mais válido'],
    [400, { detail: 'A mesa está cheia.' }, 'A mesa está cheia.'],
    [400, 'Você já é o Mestre desta campanha.', 'Você já é o Mestre desta campanha.'],
    [429, null, 'Muitas tentativas'],
    [0, null, 'conexão'],
    [500, null, 'Algo deu errado'],
  ])('erro %i mostra uma mensagem própria', (status, corpo, esperado) => {
    const { c } = montar('tk', () => erroHttp(status, corpo));
    expect(c.status()).toBe('error');
    expect(c.message()).toContain(esperado);
  });
});
