import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../services/auth.service';
import { PerfilService } from '../services/perfil.service';
import { Login } from './login/login';
import { Register } from './register/register';
import { ConfirmarEmail } from './confirmar-email/confirmar-email';
import { EsqueciSenha } from './esqueci-senha/esqueci-senha';
import { RedefinirSenha } from './redefinir-senha/redefinir-senha';
import { ConfirmarTrocaEmail } from './confirmar-troca-email/confirmar-troca-email';

/** Erro HTTP como o HttpClient entrega: o corpo da API fica em `error`. */
const falha = (corpo: unknown) => throwError(() => ({ error: corpo }));

function montar<T>(tela: Type<T>, auth: Partial<Record<keyof AuthService, unknown>>, query: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [tela],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: () => false, ...auth } },
      { provide: PerfilService, useValue: { catalogo: () => of({ beta: false, planos: [] }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParams: query, paramMap: { get: () => null } } } },
    ],
  });
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(tela);
  fixture.detectChanges();
  return { c: fixture.componentInstance, fixture, el: fixture.nativeElement as HTMLElement, navegar };
}

describe('Login', () => {
  it('entra e volta para onde a pessoa queria ir', () => {
    const login = vi.fn(() => of({}));
    const { c, navegar } = montar(Login, { login }, { returnUrl: '/ficha/3' });

    c.loginForm.setValue({ email: 'ana@x.com', senha: 'segredo' });
    c.onSubmit();

    expect(login).toHaveBeenCalledWith({ email: 'ana@x.com', senha: 'segredo' });
    expect(navegar).toHaveBeenCalledWith('/ficha/3');
  });

  it('sem destino, vai para as campanhas', () => {
    const { c, navegar } = montar(Login, { login: () => of({}) });
    c.loginForm.setValue({ email: 'ana@x.com', senha: 'segredo' });
    c.onSubmit();
    expect(navegar).toHaveBeenCalledWith('/campaigns');
  });

  it('formulário inválido não chama a API', () => {
    const login = vi.fn();
    const { c } = montar(Login, { login });
    c.loginForm.setValue({ email: 'nao-e-email', senha: '' });
    c.onSubmit();
    expect(login).not.toHaveBeenCalled();
  });

  it('mostra a mensagem da API e só oferece outro link quando o e-mail não foi confirmado', () => {
    const { c, fixture, el } = montar(Login, { login: () => falha({ message: 'Email ou senha inválidos.' }) });
    c.loginForm.setValue({ email: 'ana@x.com', senha: 'errada' });
    c.onSubmit();
    fixture.detectChanges();
    expect(el.querySelector('.alert-error')?.textContent).toContain('Email ou senha inválidos.');
    expect(c.emailNaoConfirmado).toBe(false);
    expect(c.loading).toBe(false);
  });

  it('conta não confirmada: oferece "Enviar outro link" com o e-mail digitado', () => {
    const { c, fixture, el } = montar(Login, { login: () => falha({ message: 'Confirme o seu e-mail.', codigo: 'email-nao-confirmado' }) });
    c.loginForm.setValue({ email: 'ana@x.com', senha: 'certa' });
    c.onSubmit();
    fixture.detectChanges();

    expect(c.emailNaoConfirmado).toBe(true);
    const link = el.querySelector<HTMLAnchorElement>('.alert-error a');
    expect(link?.textContent).toContain('Enviar outro link');
    expect(link?.getAttribute('href')).toMatch(/\/reenviar-confirmacao\?email=ana(@|%40)x\.com/);
  });
});

describe('Register', () => {
  const dados = { nome: 'Ana', email: 'ana@x.com', senha: 'segredo', papel: 'Jogador' };

  it('cadastra e troca o formulário pelo aviso de verificar o e-mail', () => {
    const register = vi.fn(() => of({ message: 'Enviamos um link.' }));
    const { c, fixture, el } = montar(Register, { register });

    c.registerForm.setValue(dados);
    c.onSubmit();
    fixture.detectChanges();

    expect(register).toHaveBeenCalledWith(dados);
    expect(el.querySelector('.alert-ok')?.textContent).toContain('Enviamos um link.');
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('a[href*="reenviar-confirmacao"]')).not.toBeNull();
  });

  it('senha curta não envia', () => {
    const register = vi.fn();
    const { c } = montar(Register, { register });
    c.registerForm.setValue({ ...dados, senha: '123' });
    c.onSubmit();
    expect(register).not.toHaveBeenCalled();
  });

  it('o formulário avisa que criar a conta aceita os Termos e a Política', () => {
    const { el } = montar(Register, {});
    expect(el.querySelector('.auth-aceite a[href="/termos"]')).not.toBeNull();
    expect(el.querySelector('.auth-aceite a[href="/privacidade"]')).not.toBeNull();
  });

  it('fora do beta, mostra a escolha de tipo de conta', () => {
    const { c } = montar(Register, {});
    expect(c.beta()).toBe(false);
  });

  it('erro da API aparece e destrava o botão', () => {
    const { c } = montar(Register, { register: () => falha({ message: 'Tente mais tarde.' }) });
    c.registerForm.setValue(dados);
    c.onSubmit();
    expect(c.errorMessage).toBe('Tente mais tarde.');
    expect(c.loading).toBe(false);
  });
});

describe('ConfirmarEmail', () => {
  it('confirma com o token do link', () => {
    const confirmarEmail = vi.fn(() => of(undefined));
    const { c } = montar(ConfirmarEmail, { confirmarEmail }, { token: 'abc' });
    expect(confirmarEmail).toHaveBeenCalledWith('abc');
    expect(c.estado).toBe('ok');
  });

  it('sem token, nem chama a API', () => {
    const confirmarEmail = vi.fn();
    const { c } = montar(ConfirmarEmail, { confirmarEmail });
    expect(confirmarEmail).not.toHaveBeenCalled();
    expect(c.estado).toBe('erro');
  });

  it('link vencido: mostra o motivo e oferece pedir outro link', () => {
    const { c, fixture, el } = montar(ConfirmarEmail, { confirmarEmail: () => falha({ message: 'Link expirado.' }) }, { token: 'velho' });
    fixture.detectChanges();
    expect(c.errorMessage).toBe('Link expirado.');
    expect(el.querySelector('a[href="/reenviar-confirmacao"]')).not.toBeNull();
  });
});

describe('EsqueciSenha', () => {
  it('pede o link e mostra o aviso neutro da API', () => {
    const esqueciSenha = vi.fn(() => of({ message: 'Se existir uma conta, enviamos.' }));
    const { c } = montar(EsqueciSenha, { esqueciSenha });

    c.form.setValue({ email: 'ana@x.com' });
    c.onSubmit();

    expect(esqueciSenha).toHaveBeenCalledWith('ana@x.com');
    expect(c.mensagemEnviado).toBe('Se existir uma conta, enviamos.');
  });

  it('e-mail inválido não envia', () => {
    const esqueciSenha = vi.fn();
    const { c } = montar(EsqueciSenha, { esqueciSenha });
    c.form.setValue({ email: 'x' });
    c.onSubmit();
    expect(esqueciSenha).not.toHaveBeenCalled();
  });
});

describe('RedefinirSenha', () => {
  it('troca a senha com o token do link', () => {
    const redefinirSenha = vi.fn(() => of(undefined));
    const { c } = montar(RedefinirSenha, { redefinirSenha }, { token: 'tk' });

    c.form.setValue({ novaSenha: 'nova-senha' });
    c.onSubmit();

    expect(redefinirSenha).toHaveBeenCalledWith('tk', 'nova-senha');
    expect(c.concluido).toBe(true);
  });

  it('sem token, avisa e não envia', () => {
    const redefinirSenha = vi.fn();
    const { c } = montar(RedefinirSenha, { redefinirSenha });
    c.form.setValue({ novaSenha: 'nova-senha' });
    c.onSubmit();
    expect(c.semToken).toBe(true);
    expect(c.errorMessage).toContain('inválido');
    expect(redefinirSenha).not.toHaveBeenCalled();
  });

  it('erro da API aparece', () => {
    const { c } = montar(RedefinirSenha, { redefinirSenha: () => falha({ message: 'Link expirado.' }) }, { token: 'tk' });
    c.form.setValue({ novaSenha: 'nova-senha' });
    c.onSubmit();
    expect(c.errorMessage).toBe('Link expirado.');
    expect(c.concluido).toBe(false);
  });
});

describe('ConfirmarTrocaEmail', () => {
  it('logado no mesmo aparelho: confirma e recarrega a sessão para mostrar o e-mail novo', () => {
    const carregarSessao = vi.fn(() => Promise.resolve());
    const { c } = montar(ConfirmarTrocaEmail, { confirmarTrocaEmail: () => of(undefined), isLoggedIn: () => true, carregarSessao }, { token: 'tk' });
    expect(c.estado()).toBe('ok');
    expect(carregarSessao).toHaveBeenCalled();
  });

  it('em outro aparelho (sem sessão) só confirma', () => {
    const carregarSessao = vi.fn();
    const { c } = montar(ConfirmarTrocaEmail, { confirmarTrocaEmail: () => of(undefined), carregarSessao }, { token: 'tk' });
    expect(c.estado()).toBe('ok');
    expect(carregarSessao).not.toHaveBeenCalled();
  });

  it('link inválido mostra o erro', () => {
    const { c } = montar(ConfirmarTrocaEmail, { confirmarTrocaEmail: (): Observable<void> => falha({ message: 'Link inválido ou expirado.' }) }, { token: 'x' });
    expect(c.estado()).toBe('erro');
    expect(c.erro()).toBe('Link inválido ou expirado.');
  });
});
