import { Injectable, signal } from '@angular/core';

const CHAVE = 'wyvern.sidebar.recolhida';

/**
 * Estado do "casco" do app: se a barra lateral está recolhida (preferência guardada no navegador) e se a
 * tela atual pede o modo imersivo (sem barra nenhuma, como a linha do tempo em tela cheia).
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly recolhida = signal(this.ler());
  readonly imersivo = signal(false);

  alternar() {
    const nova = !this.recolhida();
    this.recolhida.set(nova);
    try {
      localStorage.setItem(CHAVE, nova ? '1' : '0');
    } catch {
      // sem armazenamento (janela privada etc.): vale só até recarregar
    }
  }

  private ler(): boolean {
    try {
      return localStorage.getItem(CHAVE) === '1';
    } catch {
      return false;
    }
  }
}
