import { Component, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { LayoutService } from '../layout.service';
import { Avatar } from '../../../shared/ui/avatar/avatar';

interface Destino {
  rota: string;
  rotulo: string;
  icone: string;
}

/**
 * Navegação principal. No desktop é um trilho lateral; no celular vira barra inferior
 * (alcançável com o polegar) mais uma barra de topo com tema e sair.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterModule, Avatar],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private authService = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);
  layout = inject(LayoutService);
  readonly usuario = this.authService.usuarioLogado;

  readonly destinos: Destino[] = [
    { rota: '/dashboard', rotulo: 'Painel', icone: 'bi-house-door' },
    { rota: '/campaigns', rotulo: 'Campanhas', icone: 'bi-journal-bookmark' },
    { rota: '/personagens', rotulo: 'Personagens', icone: 'bi-person-lines-fill' },
    { rota: '/sessoes', rotulo: 'Sessões', icone: 'bi-calendar-event' },
  ];

  get temaAtual(): 'claro' | 'escuro' {
    return this.theme.efetivo;
  }

  alternarTema() {
    this.theme.alternar();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
