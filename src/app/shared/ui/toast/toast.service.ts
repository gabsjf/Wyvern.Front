import { Injectable, signal } from '@angular/core';

export type TipoToast = 'ok' | 'erro' | 'info';

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensagem: string;
}

/**
 * Avisos curtos na tela, no lugar de alert(). Sucessos e informações somem sozinhos;
 * erros ficam um pouco mais para dar tempo de ler (e podem ser fechados).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private proximoId = 1;
  readonly toasts = signal<Toast[]>([]);

  ok(mensagem: string): void {
    this.mostrar('ok', mensagem, 4000);
  }

  info(mensagem: string): void {
    this.mostrar('info', mensagem, 4000);
  }

  erro(mensagem: string): void {
    this.mostrar('erro', mensagem, 8000);
  }

  fechar(id: number): void {
    this.toasts.update(lista => lista.filter(t => t.id !== id));
  }

  private mostrar(tipo: TipoToast, mensagem: string, duracaoMs: number): void {
    const id = this.proximoId++;
    this.toasts.update(lista => [...lista, { id, tipo, mensagem }]);
    setTimeout(() => this.fechar(id), duracaoMs);
  }
}
