import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from './confirm.service';

/**
 * Diálogo de confirmação acessível: foco entra no botão "Cancelar" (o mais seguro), Tab fica preso
 * dentro do diálogo, Esc cancela e o foco volta para onde estava ao fechar.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    @if (aberta(); as c) {
      <div class="modal-overlay" (click)="responder(false)">
        <div class="modal-content dialogo" #dialogo role="alertdialog" aria-modal="true"
             aria-labelledby="confirm-titulo" aria-describedby="confirm-msg"
             (click)="$event.stopPropagation()" (keydown)="aoTeclar($event)">
          <h2 id="confirm-titulo" [class.perigo]="c.perigo">{{ c.titulo }}</h2>
          <p id="confirm-msg">{{ c.mensagem }}</p>
          <div class="acoes">
            <button type="button" class="btn-secondary" #cancelar (click)="responder(false)">{{ c.cancelar || 'Cancelar' }}</button>
            <button type="button" [class.btn-danger]="c.perigo" [class.btn-primary]="!c.perigo" (click)="responder(true)">{{ c.confirmar || 'Confirmar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .dialogo { max-width: 460px; }
    h2 { margin-bottom: 0.75rem; }
    h2.perigo { color: var(--danger); }
    p { color: var(--muted); margin-bottom: var(--spacing-lg); line-height: 1.5; }
    .acoes { display: flex; justify-content: flex-end; gap: var(--spacing-sm); flex-wrap: wrap; }
    @media (max-width: 480px) {
      .acoes { flex-direction: column-reverse; }
      .acoes > button { width: 100%; }
    }
  `,
})
export class ConfirmDialog {
  private servico = inject(ConfirmService);
  readonly aberta = this.servico.aberta;

  private dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private cancelar = viewChild<ElementRef<HTMLButtonElement>>('cancelar');
  private focoAnterior: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.aberta()) {
        this.focoAnterior = document.activeElement as HTMLElement | null;
        // espera o diálogo existir no DOM antes de focar
        setTimeout(() => this.cancelar()?.nativeElement.focus());
      } else if (this.focoAnterior) {
        this.focoAnterior.focus();
        this.focoAnterior = null;
      }
    });
  }

  responder(confirmado: boolean) {
    this.servico.responder(confirmado);
  }

  aoTeclar(evento: KeyboardEvent) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      this.responder(false);
      return;
    }

    if (evento.key !== 'Tab') return;

    const focaveis = Array.from(
      this.dialogo()?.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []
    );
    if (focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const atual = document.activeElement;

    if (evento.shiftKey && atual === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && atual === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }
}
