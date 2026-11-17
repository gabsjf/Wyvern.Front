import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, RouterModule, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { LayoutService } from '../layout.service';
import { PlataformaService } from '../../plataforma/plataforma.service';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { BottomSheet } from '../../../shared/ui/bottom-sheet/bottom-sheet';

interface Destino {
  rota: string;
  rotulo: string;
  icone: string;
}

/**
 * Navegação principal. No desktop é um trilho lateral; no celular vira barra inferior (alcançável com o
 * polegar) mais uma barra de topo com o título da tela e o voltar. O "Mais" da barra inferior abre um painel
 * com o que não cabe nela (anotações, perfil, tema e sair).
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterModule, Avatar, BottomSheet],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private authService = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);
  private plataforma = inject(PlataformaService);
  layout = inject(LayoutService);
  readonly usuario = this.authService.usuarioLogado;
  /** No tablet em pé o trilho fica só com os ícones, qualquer que seja a preferência guardada. */
  readonly estreito = this.plataforma.trilhoEstreito;
  readonly recolhida = computed(() => this.layout.recolhida() || this.estreito());

  readonly destinos: Destino[] = [
    { rota: '/dashboard', rotulo: 'Painel', icone: 'bi-house-door' },
    { rota: '/campaigns', rotulo: 'Campanhas', icone: 'bi-journal-bookmark' },
    { rota: '/personagens', rotulo: 'Personagens', icone: 'bi-person-lines-fill' },
    { rota: '/sessoes', rotulo: 'Sessões', icone: 'bi-calendar-event' },
    { rota: '/anotacoes', rotulo: 'Anotações', icone: 'bi-journal-text' },
  ];
  /** A barra inferior tem 4 destinos e o "Mais"; o resto vai para o painel. */
  readonly destinosBarra = this.destinos.slice(0, 4);
  readonly maisAberto = signal(false);

  private readonly rota = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.lerRota()),
    ),
    { initialValue: this.lerRota() },
  );

  /** Título da barra de topo: o que a tela pediu, senão o título da rota sem o " · Wyvern". */
  readonly titulo = computed(() => this.layout.tituloMobile() ?? this.rota().titulo);
  /** Nas telas da barra inferior não há para onde voltar: aparece a marca no lugar da seta. */
  readonly raiz = computed(() => this.destinosBarra.some(d => d.rota === this.rota().caminho));
  /** "Mais" fica aceso quando a tela atual é uma das que ele abre. */
  readonly maisAtivo = computed(() => ['/anotacoes', '/perfil'].includes(this.rota().caminho));

  get temaAtual(): 'claro' | 'escuro' {
    return this.theme.efetivo;
  }

  alternarTema() {
    this.theme.alternar();
  }

  tocar() {
    this.plataforma.vibrar('leve');
  }

  voltar() {
    // Sem tela anterior no app (abriu por um link direto), volta para o painel.
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) history.back();
    else this.router.navigateByUrl('/dashboard');
  }

  irPara(rota: string) {
    this.maisAberto.set(false);
    this.router.navigateByUrl(rota);
  }

  logout() {
    this.maisAberto.set(false);
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private lerRota(): { caminho: string; titulo: string } {
    let r: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (r.firstChild) r = r.firstChild;
    return {
      caminho: this.router.url.split(/[?#]/)[0],
      titulo: (r.title ?? 'Wyvern').replace(/\s*·\s*Wyvern$/, ''),
    };
  }
}
