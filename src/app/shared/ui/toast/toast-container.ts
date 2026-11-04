import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  template: `
    <div class="toast-region" aria-live="polite">
      @for (t of toasts(); track t.id) {
        <div class="toast" [class.toast-ok]="t.tipo === 'ok'" [class.toast-erro]="t.tipo === 'erro'"
             [attr.role]="t.tipo === 'erro' ? 'alert' : 'status'">
          <span class="toast-msg">{{ t.mensagem }}</span>
          <button type="button" class="toast-x" (click)="fechar(t.id)" aria-label="Fechar aviso">&times;</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-region {
      position: fixed;
      right: max(1rem, env(safe-area-inset-right, 0px));
      bottom: max(1rem, env(safe-area-inset-bottom, 0px));
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(420px, calc(100vw - 2rem));
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 0.75rem 0.75rem 1rem;
      background: var(--surface);
      color: var(--fg);
      border: 1px solid var(--line);
      border-left: 4px solid var(--hi);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow);
      animation: entrar 0.2s ease both;
    }

    .toast-ok { border-left-color: var(--ok); }
    .toast-erro { border-left-color: var(--danger); }

    .toast-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.4; }

    .toast-x {
      flex: none;
      width: 44px;
      height: 44px;
      margin: -0.6rem -0.4rem -0.6rem 0;
      background: transparent;
      border: 0;
      color: var(--muted);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
    }
    .toast-x:hover { color: var(--fg); }

    @keyframes entrar {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* No celular o aviso sobe para ficar acima da barra de navegação inferior */
    @media (max-width: 900px) {
      .toast-region {
        left: max(1rem, env(safe-area-inset-left, 0px));
        right: max(1rem, env(safe-area-inset-right, 0px));
        bottom: calc(68px + env(safe-area-inset-bottom, 0px));
        width: auto;
      }
    }
  `,
})
export class ToastContainer {
  private toast = inject(ToastService);
  readonly toasts = this.toast.toasts;

  fechar(id: number) {
    this.toast.fechar(id);
  }
}
