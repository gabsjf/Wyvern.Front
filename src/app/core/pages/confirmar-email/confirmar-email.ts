import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthShell } from '../../../shared/ui/auth-shell/auth-shell';

type Estado = 'confirmando' | 'ok' | 'erro';

/** Destino do link do e-mail de cadastro: /confirmar-email?token=... */
@Component({
  selector: 'app-confirmar-email',
  standalone: true,
  imports: [CommonModule, RouterModule, AuthShell],
  templateUrl: './confirmar-email.html',
  styleUrl: './confirmar-email.scss',
})
export class ConfirmarEmail implements OnInit {
  estado: Estado = 'confirmando';
  errorMessage = '';

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef); // o app é zoneless: o callback do HTTP não redesenha a tela sozinho
  private route = inject(ActivatedRoute);

  ngOnInit() {
    const token = this.route.snapshot.queryParams['token'];
    if (!token) {
      this.falhar('Link de confirmação inválido.');
      return;
    }

    this.authService.confirmarEmail(token).subscribe({
      next: () => {
        this.estado = 'ok';
        this.cdr.markForCheck();
      },
      error: err => this.falhar(err.error?.message || 'Não foi possível confirmar o e-mail.'),
    });
  }

  private falhar(mensagem: string) {
    this.errorMessage = mensagem;
    this.estado = 'erro';
    this.cdr.markForCheck();
  }
}
