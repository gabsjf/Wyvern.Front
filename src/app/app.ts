import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { identificarUsuario } from './core/monitoramento';
import { RouterOutlet, Router } from '@angular/router';
import { Sidebar } from './core/layout/sidebar/sidebar';
import { AuthService } from './core/services/auth.service';
import { CommonModule } from '@angular/common';
import { App as CapacitorApp } from '@capacitor/app';
import { ToastContainer } from './shared/ui/toast/toast-container';
import { ConfirmDialog } from './shared/ui/confirm/confirm-dialog';
import { LayoutService } from './core/layout/layout.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Sidebar, ToastContainer, ConfirmDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('wyvern-front');
  authService = inject(AuthService);
  router = inject(Router);
  layout = inject(LayoutService);

  constructor() {
    // Os erros enviados ao Sentry levam só o id da conta logada.
    effect(() => identificarUsuario(this.authService.usuarioLogado()?.usuarioId ?? null));
  }

  /** Largura da barra lateral, para elementos flutuantes não ficarem por cima dela (no celular ela não existe). */
  get larguraLateral(): string {
    if (!this.authService.isLoggedIn() || this.layout.imersivo()) return "0px";
    return this.layout.recolhida() ? "68px" : "208px";
  }

  ngOnInit() {
    // Escuta eventos de Deep Link
    CapacitorApp.addListener('appUrlOpen', (event: any) => {
      const slug = event.url.split('.app').pop();
      if (slug) {
        // Redireciona o Angular para a rota capturada do link
        this.router.navigateByUrl(slug);
      }
    });
  }
}
