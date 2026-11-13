import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { PerfilComponent as Perfil } from './perfil';
import { PerfilService } from '../../services/perfil.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';

/** WYV-08: trocar a senha estando logado, pela tela Meu perfil. */
function montar(trocarSenha = vi.fn((_atual: string, _nova: string) => of(undefined as void))) {
  const toast = { ok: vi.fn(), erro: vi.fn(), info: vi.fn() };
  const servico = {
    obter: () => of({ usuarioId: 1, nome: 'Ana', email: 'ana@x.com', emailPendente: null, criadoEm: '2026-01-01', fotoVersao: 0, conta: { plano: 'Free', nomePlano: 'Free', beta: true, podeCriarCampanha: true, motivoBloqueio: null, maxCampanhas: null, maxJogadoresPorCampanha: null, campanhasCriadas: 0 } }),
    sessoes: vi.fn(() => of([])),
    trocarSenha,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Perfil],
    providers: [
      provideRouter([]),
      { provide: PerfilService, useValue: servico },
      { provide: AuthService, useValue: { usuarioLogado: () => null, atualizarUsuario: vi.fn() } },
      { provide: ToastService, useValue: toast },
      { provide: ConfirmService, useValue: { confirmar: vi.fn(async () => true) } },
    ],
  });
  const c = TestBed.createComponent(Perfil).componentInstance;
  c.ngOnInit();
  return { c, servico, toast };
}

function preencher(c: Perfil, atual: string, nova: string, confirmacao = nova) {
  c.senhaAtual = atual;
  c.novaSenha = nova;
  c.confirmacaoSenha = confirmacao;
}

describe('Perfil: trocar senha', () => {
  it('troca, limpa os campos, avisa e recarrega os aparelhos', () => {
    const { c, servico, toast } = montar();
    preencher(c, 'senha123', 'nova-senha-1');

    c.trocarSenha();

    expect(servico.trocarSenha).toHaveBeenCalledWith('senha123', 'nova-senha-1');
    expect([c.senhaAtual, c.novaSenha, c.confirmacaoSenha]).toEqual(['', '', '']);
    expect(toast.ok).toHaveBeenCalledWith(expect.stringContaining('e-mail'));
    expect(servico.sessoes).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['', 'nova-senha-1', 'nova-senha-1', 'Preencha'],
    ['senha123', '123', '123', '6 caracteres'],
    ['senha123', 'nova-senha-1', 'outra', 'confirmação'],
    ['senha123', 'senha123', 'senha123', 'diferente da atual'],
  ])('não envia com dados inválidos (%s → %s)', (atual, nova, confirmacao, erro) => {
    const { c, servico } = montar();
    preencher(c, atual, nova, confirmacao);

    c.trocarSenha();

    expect(servico.trocarSenha).not.toHaveBeenCalled();
    expect(c.erroSenha()).toContain(erro);
  });

  it('mostra o erro da API (senha atual errada) e destrava o botão', () => {
    const { c } = montar(vi.fn(() => throwError(() => ({ error: { message: 'Senha atual incorreta.' } }))));
    preencher(c, 'errada', 'nova-senha-1');

    c.trocarSenha();

    expect(c.trocandoSenha()).toBe(false);
    expect(c.erroSenha()).toBeTruthy();
  });
});
