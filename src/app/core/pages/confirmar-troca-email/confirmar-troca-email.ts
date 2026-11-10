import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthShell } from '../../../shared/ui/auth-shell/auth-shell';

type Estado = 'confirmando' | 'ok' | 'erro';

/** Destino do link enviado ao e-mail novo pela tela de perfil: /confirmar-troca-email?token=... */
@Component({
  selector: 'app-confirmar-troca-email',
  imports: [RouterModule, AuthShell],
  templateUrl: './confirmar-troca-email.html',
})
export class ConfirmarTrocaEmail implements OnInit {
  readonly estado = signal<Estado>('confirmando');
  readonly erro = signal('');

  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  /** Logado (o link abriu no mesmo aparelho): volta para o perfil; senão, vai para o login. */
  get logado(): boolean {
    return this.auth.isLoggedIn();
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParams['token'];
    if (!token) {
      this.falhar('Link de troca de e-mail inválido.');
      return;
    }

    this.auth.confirmarTrocaEmail(token).subscribe({
      next: () => {
        this.estado.set('ok');
        // a barra lateral e o perfil passam a mostrar o e-mail novo
        if (this.logado) this.auth.carregarSessao();
      },
      error: err => this.falhar(err.error?.message || 'Não foi possível confirmar o novo e-mail.'),
    });
  }

  private falhar(mensagem: string): void {
    this.erro.set(mensagem);
    this.estado.set('erro');
  }
}
