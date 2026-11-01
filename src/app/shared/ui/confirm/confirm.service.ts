import { Injectable, signal } from '@angular/core';

export interface OpcoesConfirmacao {
  titulo: string;
  mensagem: string;
  /** Texto do botão de confirmar. Padrão: "Confirmar". */
  confirmar?: string;
  /** Texto do botão de cancelar. Padrão: "Cancelar". */
  cancelar?: string;
  /** Destaca a ação como destrutiva (botão vermelho). */
  perigo?: boolean;
}

export interface ConfirmacaoAberta extends OpcoesConfirmacao {
  resolver: (confirmado: boolean) => void;
}

/** Pergunta de confirmação no lugar de confirm(): `if (await confirm.confirmar({...})) { ... }`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly aberta = signal<ConfirmacaoAberta | null>(null);

  confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
    // Se já houver uma pergunta aberta, ela é respondida como "não" antes de abrir a nova.
    this.aberta()?.resolver(false);
    return new Promise<boolean>(resolver => this.aberta.set({ ...opcoes, resolver }));
  }

  responder(confirmado: boolean): void {
    const atual = this.aberta();
    if (!atual) return;
    this.aberta.set(null);
    atual.resolver(confirmado);
  }
}
