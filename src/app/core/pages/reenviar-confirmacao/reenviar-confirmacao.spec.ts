import { ActivatedRoute, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ReenviarConfirmacao } from './reenviar-confirmacao';
import { AuthService } from '../../services/auth.service';

function montar(query: Record<string, string> = {}, resposta = of({ message: 'Enviamos um link novo.' })) {
  const auth = { reenviarConfirmacao: vi.fn(() => resposta) };
  TestBed.configureTestingModule({
    imports: [ReenviarConfirmacao],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParams: query } } },
    ],
  });
  const fixture = TestBed.createComponent(ReenviarConfirmacao);
  fixture.detectChanges();
  return { c: fixture.componentInstance, auth, fixture };
}

describe('ReenviarConfirmacao', () => {
  it('vem com o e-mail do link preenchido', () => {
    const { c } = montar({ email: 'ana@teste.com' });
    expect(c.form.value.email).toBe('ana@teste.com');
  });

  it('não envia com e-mail inválido', () => {
    const { c, auth } = montar({ email: 'nao-e-email' });
    c.onSubmit();
    expect(auth.reenviarConfirmacao).not.toHaveBeenCalled();
  });

  it('envia e troca o formulário pelo aviso', () => {
    const { c, auth, fixture } = montar({ email: 'ana@teste.com' });
    c.onSubmit();
    fixture.detectChanges();

    expect(auth.reenviarConfirmacao).toHaveBeenCalledWith('ana@teste.com');
    expect(c.mensagemEnviado).toBe('Enviamos um link novo.');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('mostra o erro do servidor e deixa tentar de novo', () => {
    const { c, fixture } = montar({ email: 'ana@teste.com' }, throwError(() => ({ error: { message: 'Muitas tentativas.' } })));
    c.onSubmit();
    fixture.detectChanges();

    expect(c.errorMessage).toBe('Muitas tentativas.');
    expect(c.loading).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
