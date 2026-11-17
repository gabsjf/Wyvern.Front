import { Injectable, signal } from '@angular/core';

export type TemaEscolhido = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'wyvern-tema';

/**
 * Tema claro/escuro. Por padrão segue o sistema (prefers-color-scheme); quem escolhe manualmente
 * grava a preferência neste aparelho. O CSS lê o atributo data-theme na raiz do documento.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private escolhido: TemaEscolhido = 'sistema';
  /** O mesmo que `efetivo`, como signal (a barra de status do app acompanha). */
  readonly atual = signal<'claro' | 'escuro'>('escuro');

  constructor() {
    this.escolhido = this.lerPreferencia();
    this.aplicar();
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => this.atual.set(this.efetivo));
    } catch {
      /* sem matchMedia (testes): o tema do sistema não muda */
    }
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
    this.atual.set(this.efetivo);
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
