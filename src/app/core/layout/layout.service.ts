import { Injectable, signal } from '@angular/core';

const CHAVE = 'wyvern.sidebar.recolhida';

/**
 * Estado do "casco" do app: se a barra lateral está recolhida (preferência guardada no navegador) e se a
 * tela atual pede o modo imersivo (sem barra nenhuma, como a linha do tempo em tela cheia).
 *
 * Também guarda a pilha de camadas abertas (bottom sheets, diálogos): o botão voltar do Android fecha a de
 * cima antes de sair da tela.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly recolhida = signal(this.ler());
  readonly imersivo = signal(false);
  /** Título da barra de topo no celular, quando a tela quer um diferente do da rota (ex.: nome da campanha). */
  readonly tituloMobile = signal<string | null>(null);

  private camadas: (() => void)[] = [];

  alternar() {
    const nova = !this.recolhida();
    this.recolhida.set(nova);
    try {
      localStorage.setItem(CHAVE, nova ? '1' : '0');
    } catch {
      // sem armazenamento (janela privada etc.): vale só até recarregar
    }
  }

  /** Registra uma camada aberta; `fechar` é chamado pelo botão voltar. Devolve a função que a tira da pilha. */
  abrirCamada(fechar: () => void): () => void {
    this.camadas.push(fechar);
    return () => {
      const i = this.camadas.lastIndexOf(fechar);
      if (i >= 0) this.camadas.splice(i, 1);
    };
  }

  /** Fecha a camada de cima. Devolve false se não havia nenhuma aberta. */
  fecharCamadaDoTopo(): boolean {
    const fechar = this.camadas.pop();
    if (!fechar) return false;
    fechar();
    return true;
  }

  private ler(): boolean {
    try {
      return localStorage.getItem(CHAVE) === '1';
    } catch {
      return false;
    }
  }
}
