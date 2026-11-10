import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Perfil, PerfilService, PreviaDeExclusao, SessaoAtiva, TAMANHO_MAXIMO_FOTO, TIPOS_DE_FOTO } from '../../services/perfil.service';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';

/** Tela "Meu perfil": foto e nome, e-mail, senha, aparelhos conectados e plano. */
@Component({
  selector: 'app-perfil',
  imports: [FormsModule, DatePipe, Avatar],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
})
export class PerfilComponent implements OnInit {
  private perfilService = inject(PerfilService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly perfil = signal<Perfil | null>(null);
  readonly erroAoCarregar = signal(false);
  readonly sessoes = signal<SessaoAtiva[] | null>(null);
  readonly outrasSessoes = computed(() => (this.sessoes() ?? []).filter(s => !s.atual).length);

  // ---------- foto e nome ----------
  nome = '';
  readonly salvandoNome = signal(false);
  readonly enviandoFoto = signal(false);

  // ---------- e-mail ----------
  novoEmail = '';
  senhaParaEmail = '';
  readonly enviandoEmail = signal(false);
  readonly erroEmail = signal('');

  // ---------- senha ----------
  senhaAtual = '';
  novaSenha = '';
  confirmacaoSenha = '';
  readonly trocandoSenha = signal(false);
  readonly erroSenha = signal('');

  readonly encerrando = signal<string | null>(null);
  readonly virandoMestre = signal(false);

  // ---------- excluir conta ----------
  readonly exclusaoAberta = signal(false);
  readonly previa = signal<PreviaDeExclusao | null>(null);
  readonly excluindo = signal(false);
  readonly erroExclusao = signal('');
  senhaParaExcluir = '';
  confirmacaoExclusao = '';

  ngOnInit(): void {
    this.carregar();
    this.carregarSessoes();
  }

  carregar(): void {
    this.erroAoCarregar.set(false);
    this.perfilService.obter().subscribe({
      next: p => {
        this.perfil.set(p);
        this.nome = p.nome;
      },
      error: () => this.erroAoCarregar.set(true),
    });
  }

  private carregarSessoes(): void {
    this.perfilService.sessoes().subscribe({
      next: lista => this.sessoes.set(lista),
      error: () => this.sessoes.set([]),
    });
  }

  // ---------- foto e nome ----------

  get nomeMudou(): boolean {
    const atual = this.perfil()?.nome ?? '';
    return this.nome.trim().length > 0 && this.nome.trim() !== atual;
  }

  salvarNome(): void {
    if (!this.nomeMudou || this.salvandoNome()) return;
    this.salvandoNome.set(true);
    this.perfilService.alterarNome(this.nome.trim()).subscribe({
      next: p => {
        this.perfil.set(p);
        this.nome = p.nome;
        this.salvandoNome.set(false);
        this.toast.ok('Nome atualizado.');
      },
      error: err => {
        this.salvandoNome.set(false);
        this.toast.erro(this.mensagem(err, 'Não foi possível salvar o nome.'));
      },
    });
  }

  escolherFoto(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = ''; // escolher o mesmo arquivo de novo dispara o change outra vez
    if (!arquivo) return;

    if (!TIPOS_DE_FOTO.includes(arquivo.type)) {
      this.toast.erro('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
      this.toast.erro('A foto precisa ter até 2 MB.');
      return;
    }

    this.enviandoFoto.set(true);
    this.perfilService.enviarFoto(arquivo).subscribe({
      next: p => {
        this.perfil.set(p);
        this.enviandoFoto.set(false);
        this.toast.ok('Foto atualizada.');
      },
      error: err => {
        this.enviandoFoto.set(false);
        this.toast.erro(this.mensagem(err, 'Não foi possível enviar a foto.'));
      },
    });
  }

  async removerFoto(): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Remover foto',
      mensagem: 'A sua foto sai do perfil e as suas iniciais aparecem no lugar.',
      confirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;

    this.enviandoFoto.set(true);
    this.perfilService.removerFoto().subscribe({
      next: p => {
        this.perfil.set(p);
        this.enviandoFoto.set(false);
        this.toast.ok('Foto removida.');
      },
      error: err => {
        this.enviandoFoto.set(false);
        this.toast.erro(this.mensagem(err, 'Não foi possível remover a foto.'));
      },
    });
  }

  // ---------- plano ----------

  async virarMestre(): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Virar Mestre',
      mensagem: 'A sua conta passa a ser Mestre no plano Free: você poderá criar 1 campanha com até 2 jogadores. Continua podendo jogar nas campanhas dos outros.',
      confirmar: 'Virar Mestre',
    });
    if (!ok) return;

    this.virandoMestre.set(true);
    this.perfilService.virarMestre().subscribe({
      next: conta => {
        this.virandoMestre.set(false);
        this.perfil.update(p => (p ? { ...p, conta } : p));
        this.toast.ok('Pronto! Agora você é Mestre.');
      },
      error: err => {
        this.virandoMestre.set(false);
        this.toast.erro(this.mensagem(err, 'Não foi possível ativar a conta de Mestre.'));
      },
    });
  }

  // ---------- excluir conta ----------

  abrirExclusao(): void {
    this.exclusaoAberta.set(true);
    this.erroExclusao.set('');
    this.previa.set(null);
    this.perfilService.previaDeExclusao().subscribe({
      next: p => this.previa.set(p),
      error: () => this.previa.set({ transferidas: [], encerradas: [] }),
    });
  }

  fecharExclusao(): void {
    this.exclusaoAberta.set(false);
    this.senhaParaExcluir = this.confirmacaoExclusao = '';
    this.erroExclusao.set('');
  }

  get confirmacaoOk(): boolean {
    return this.confirmacaoExclusao.trim().toUpperCase() === 'EXCLUIR' && this.senhaParaExcluir.length > 0;
  }

  excluirConta(): void {
    if (!this.confirmacaoOk || this.excluindo()) return;
    this.excluindo.set(true);
    this.erroExclusao.set('');
    this.perfilService.excluirConta(this.senhaParaExcluir, this.confirmacaoExclusao.trim()).subscribe({
      next: () => {
        this.excluindo.set(false);
        this.auth.logout(); // o servidor já encerrou as sessões; aqui só limpa o estado local
        this.toast.ok('A sua conta foi excluída. Até a próxima aventura!');
        this.router.navigate(['/']);
      },
      error: err => {
        this.excluindo.set(false);
        this.erroExclusao.set(this.mensagem(err, 'Não foi possível excluir a conta.'));
      },
    });
  }

  // ---------- e-mail ----------

  pedirTrocaDeEmail(): void {
    if (this.enviandoEmail()) return;
    this.erroEmail.set('');
    const novo = this.novoEmail.trim();
    if (!novo || !this.senhaParaEmail) {
      this.erroEmail.set('Preencha o novo e-mail e a sua senha atual.');
      return;
    }

    this.enviandoEmail.set(true);
    this.perfilService.trocarEmail(novo, this.senhaParaEmail).subscribe({
      next: resposta => {
        this.enviandoEmail.set(false);
        this.novoEmail = '';
        this.senhaParaEmail = '';
        this.perfil.update(p => (p ? { ...p, emailPendente: novo } : p));
        this.toast.ok(resposta?.message || 'Enviamos um link para o novo e-mail.');
      },
      error: err => {
        this.enviandoEmail.set(false);
        this.erroEmail.set(this.mensagem(err, 'Não foi possível pedir a troca de e-mail.'));
      },
    });
  }

  // ---------- senha ----------

  trocarSenha(): void {
    if (this.trocandoSenha()) return;
    this.erroSenha.set('');
    if (!this.senhaAtual || !this.novaSenha) {
      this.erroSenha.set('Preencha a senha atual e a nova senha.');
      return;
    }
    if (this.novaSenha.length < 6) {
      this.erroSenha.set('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (this.novaSenha !== this.confirmacaoSenha) {
      this.erroSenha.set('A confirmação não bate com a nova senha.');
      return;
    }

    this.trocandoSenha.set(true);
    this.perfilService.trocarSenha(this.senhaAtual, this.novaSenha).subscribe({
      next: () => {
        this.trocandoSenha.set(false);
        this.senhaAtual = this.novaSenha = this.confirmacaoSenha = '';
        this.toast.ok('Senha alterada. As outras sessões foram encerradas.');
        this.carregarSessoes();
      },
      error: err => {
        this.trocandoSenha.set(false);
        this.erroSenha.set(this.mensagem(err, 'Não foi possível trocar a senha.'));
      },
    });
  }

  // ---------- aparelhos conectados ----------

  async encerrar(sessao: SessaoAtiva): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Encerrar sessão',
      mensagem: `"${sessao.dispositivo}" vai sair da sua conta e precisará entrar de novo.`,
      confirmar: 'Encerrar',
      perigo: true,
    });
    if (!ok) return;

    this.encerrando.set(sessao.id);
    this.perfilService.encerrarSessao(sessao.id).subscribe({
      next: () => {
        this.encerrando.set(null);
        this.sessoes.update(lista => (lista ?? []).filter(s => s.id !== sessao.id));
        this.toast.ok('Sessão encerrada.');
      },
      error: err => {
        this.encerrando.set(null);
        this.toast.erro(this.mensagem(err, 'Não foi possível encerrar a sessão.'));
        this.carregarSessoes();
      },
    });
  }

  async encerrarOutras(): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Encerrar as outras sessões',
      mensagem: 'Todos os outros aparelhos vão sair da sua conta. Este continua conectado.',
      confirmar: 'Encerrar todas',
      perigo: true,
    });
    if (!ok) return;

    this.encerrando.set('outras');
    this.perfilService.encerrarOutrasSessoes().subscribe({
      next: () => {
        this.encerrando.set(null);
        this.sessoes.update(lista => (lista ?? []).filter(s => s.atual));
        this.toast.ok('As outras sessões foram encerradas.');
      },
      error: err => {
        this.encerrando.set(null);
        this.toast.erro(this.mensagem(err, 'Não foi possível encerrar as sessões.'));
      },
    });
  }

  /** A API grava as datas das sessões em UTC sem o "Z"; sem ele o navegador as leria como hora local. */
  utc(data: string): string {
    return /[zZ]|[+-]\d\d:\d\d$/.test(data) ? data : `${data}Z`;
  }

  iconeDoAparelho(dispositivo: string): string {
    if (/Android|iOS|App Wyvern/i.test(dispositivo)) return 'bi-phone';
    if (/desconhecido/i.test(dispositivo)) return 'bi-question-circle';
    return 'bi-laptop';
  }

  private mensagem(err: unknown, padrao: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 429) return err.error?.message || 'Muitas tentativas. Espere um pouco e tente de novo.';
      const corpo = err.error;
      if (corpo?.message) return corpo.message;
      if (corpo?.detail) return corpo.detail; // ProblemDetails do tratador global de erros
      // erros de validação do ASP.NET: { errors: { Campo: ["mensagem"] } }
      const primeiro = corpo?.errors && Object.values(corpo.errors as Record<string, string[]>)[0]?.[0];
      if (primeiro) return primeiro;
    }
    return padrao;
  }
}
