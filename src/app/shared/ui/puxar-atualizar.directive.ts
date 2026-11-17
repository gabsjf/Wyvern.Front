import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';
import { PlataformaService } from '../../core/plataforma/plataforma.service';

/** Quanto puxar (px) para valer. */
const LIMIAR = 72;

/**
 * "Puxar para atualizar" das listas no celular: com a página no topo, arrastar o dedo para baixo mostra uma
 * setinha girando e, passando do limiar, emite `atualizar`. A tela recarrega com o service que já usa.
 *
 * `<section appPuxarAtualizar (atualizar)="carregar()">`
 */
@Directive({ selector: '[appPuxarAtualizar]' })
export class PuxarAtualizar {
  readonly atualizar = output<void>();

  private plataforma = inject(PlataformaService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private indicador = document.createElement('div');
  private inicioY: number | null = null;
  private distancia = 0;
  private avisou = false;

  constructor() {
    this.indicador.className = 'puxar-indicador';
    this.indicador.setAttribute('aria-hidden', 'true');
    this.indicador.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
    this.host.prepend(this.indicador);

    const inicio = (e: TouchEvent) => {
      this.inicioY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      this.avisou = false;
    };
    const mover = (e: TouchEvent) => {
      if (this.inicioY === null) return;
      this.distancia = Math.max(0, Math.min(120, (e.touches[0].clientY - this.inicioY) * 0.5));
      if (this.distancia >= LIMIAR && !this.avisou) {
        this.avisou = true;
        this.plataforma.vibrar('leve');
      }
      this.pintar();
    };
    const fim = () => {
      if (this.inicioY === null) return;
      if (this.distancia >= LIMIAR) this.atualizar.emit();
      this.inicioY = null;
      this.distancia = 0;
      this.pintar();
    };

    this.host.addEventListener('touchstart', inicio, { passive: true });
    this.host.addEventListener('touchmove', mover, { passive: true });
    this.host.addEventListener('touchend', fim);
    this.host.addEventListener('touchcancel', fim);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('touchstart', inicio);
      this.host.removeEventListener('touchmove', mover);
      this.host.removeEventListener('touchend', fim);
      this.host.removeEventListener('touchcancel', fim);
      this.indicador.remove();
    });
  }

  private pintar() {
    const d = this.distancia;
    this.indicador.style.opacity = d ? String(Math.min(1, d / LIMIAR)) : '';
    this.indicador.style.transform = d ? `translate(-50%, ${d}px) rotate(${d * 3}deg)` : '';
    this.indicador.classList.toggle('pronto', d >= LIMIAR);
  }
}
