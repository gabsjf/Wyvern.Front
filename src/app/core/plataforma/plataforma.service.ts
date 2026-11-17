import { DestroyRef, Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { SplashScreen } from '@capacitor/splash-screen';
import { ThemeService } from '../services/theme.service';

export type Vibracao = 'leve' | 'media' | 'forte' | 'sucesso' | 'aviso' | 'erro';

/**
 * O que muda entre o app nativo (Capacitor) e o navegador: vibração, teclado, barras do sistema e orientação.
 * No navegador tudo vira "não faz nada", então as telas podem chamar sem perguntar onde estão.
 *
 * Orientação: no celular o app fica em pé. Rotas com `data: { paisagem: true }` e telas que chamam
 * `pedirPaisagem()` (a aba do mapa na sessão) liberam o giro enquanto estão abertas.
 */
@Injectable({ providedIn: 'root' })
export class PlataformaService {
  private router = inject(Router);
  private tema = inject(ThemeService);

  readonly nativo = Capacitor.isNativePlatform();
  /** Celular em pé (mesmo ponto do mixin `mobile.compacto`). */
  readonly compacto = this.media('(max-width: 720px)');
  /** Celular em pé ou deitado: navegação na barra inferior (mesma consulta do mixin `mobile.celular`). */
  readonly celular = this.media('(max-width: 720px), (orientation: landscape) and (max-height: 500px) and (max-width: 1000px)');
  private readonly ate900 = this.media('(max-width: 900px)');
  /** Tablet em pé (ou janela estreita): o trilho lateral fica só com os ícones, sem opção de expandir. */
  readonly trilhoEstreito = computed(() => this.ate900() && !this.celular());
  readonly paisagem = this.media('(orientation: landscape)');
  readonly tecladoAberto = signal(false);

  private readonly paisagemDaRota = signal(false);
  private readonly pedidosDePaisagem = signal(0);
  readonly paisagemLiberada = computed(() => this.paisagemDaRota() || this.pedidosDePaisagem() > 0);

  constructor() {
    if (this.nativo) document.documentElement.classList.add('nativo');

    this.router.events.subscribe(evento => {
      if (evento instanceof NavigationEnd) this.paisagemDaRota.set(this.rotaPedePaisagem(this.router.routerState.snapshot.root));
    });

    if (!this.nativo) return;

    Keyboard.addListener('keyboardWillShow', () => this.definirTeclado(true));
    Keyboard.addListener('keyboardWillHide', () => this.definirTeclado(false));

    // Texto da barra de status claro no tema escuro e escuro no tema claro (o fundo é o do app, de ponta a ponta).
    effect(() => {
      const style = this.tema.atual() === 'escuro' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
      SystemBars.setStyle({ style }).catch(() => {});
    });

    effect(() => {
      if (!this.ehCelular()) return;
      const pedido = this.paisagemLiberada() ? ScreenOrientation.unlock() : ScreenOrientation.lock({ orientation: 'portrait' });
      pedido.catch(() => {});
    });

    SplashScreen.hide().catch(() => {});
  }

  /** Libera o giro para paisagem enquanto a tela estiver aberta. Chame a função devolvida (ou destrua o DestroyRef) para soltar. */
  pedirPaisagem(destroyRef?: DestroyRef): () => void {
    let solto = false;
    this.pedidosDePaisagem.update(n => n + 1);
    const soltar = () => {
      if (solto) return;
      solto = true;
      this.pedidosDePaisagem.update(n => n - 1);
    };
    destroyRef?.onDestroy(soltar);
    return soltar;
  }

  vibrar(tipo: Vibracao = 'leve'): void {
    if (!this.nativo) return;
    const pedido = tipo === 'sucesso' || tipo === 'aviso' || tipo === 'erro'
      ? Haptics.notification({ type: { sucesso: NotificationType.Success, aviso: NotificationType.Warning, erro: NotificationType.Error }[tipo] })
      : Haptics.impact({ style: { leve: ImpactStyle.Light, media: ImpactStyle.Medium, forte: ImpactStyle.Heavy }[tipo] });
    pedido.catch(() => {});
  }

  private definirTeclado(aberto: boolean) {
    this.tecladoAberto.set(aberto);
    document.documentElement.classList.toggle('teclado-aberto', aberto);
  }

  /** Telefone, não tablet: o lado menor da tela tem menos de 600px. */
  private ehCelular(): boolean {
    return Math.min(window.screen.width, window.screen.height) < 600;
  }

  private rotaPedePaisagem(rota: ActivatedRouteSnapshot): boolean {
    for (let r: ActivatedRouteSnapshot | null = rota; r; r = r.firstChild) {
      if (r.data['paisagem']) return true;
    }
    return false;
  }

  private media(consulta: string): Signal<boolean> {
    const lista = typeof window.matchMedia === 'function' ? window.matchMedia(consulta) : null;
    const valor = signal(lista?.matches ?? false);
    // WebViews antigos (e os dublês dos testes) só têm addListener, ou nenhum dos dois
    const aoMudar = (e: MediaQueryListEvent) => valor.set(e.matches);
    if (typeof lista?.addEventListener === 'function') lista.addEventListener('change', aoMudar);
    else lista?.addListener?.(aoMudar);
    return valor.asReadonly();
  }
}
