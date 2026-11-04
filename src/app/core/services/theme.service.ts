import { Injectable } from '@angular/core';

export type TemaEscolhido = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'wyvern-tema';

/**
 * Tema claro/escuro. Por padrão segue o sistema (prefers-color-scheme); quem escolhe manualmente
 * grava a preferência neste aparelho. O CSS lê o atributo data-theme na raiz do documento.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private escolhido: TemaEscolhido = 'sistema';

  constructor() {
    this.escolhido = this.lerPreferencia();
    this.aplicar();
  }

  /** Tema que está valendo agora na tela (considera o sistema quando nada foi escolhido). */
  get efetivo(): 'claro' | 'escuro' {
    if (this.escolhido !== 'sistema') return this.escolhido;
    return this.sistemaEhClaro() ? 'claro' : 'escuro';
  }

  /** Alterna entre claro e escuro e guarda a escolha. */
  alternar(): void {
    this.escolhido = this.efetivo === 'escuro' ? 'claro' : 'escuro';
    this.gravarPreferencia();
    this.aplicar();
  }

  private aplicar(): void {
    const raiz = document.documentElement;
    if (this.escolhido === 'sistema') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', this.escolhido === 'claro' ? 'light' : 'dark');
  }

  private sistemaEhClaro(): boolean {
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch {
      return false;
    }
  }

  private lerPreferencia(): TemaEscolhido {
    try {
      const valor = localStorage.getItem(CHAVE);
      return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
    } catch {
      return 'sistema';
    }
  }

  private gravarPreferencia(): void {
    try {
      localStorage.setItem(CHAVE, this.escolhido);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
}
