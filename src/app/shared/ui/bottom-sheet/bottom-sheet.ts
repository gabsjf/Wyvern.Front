import {
  Component, DestroyRef, ElementRef, booleanAttribute, computed, effect, inject, input, model, output, signal, untracked, viewChild,
} from '@angular/core';
import { LayoutService } from '../../../core/layout/layout.service';
import { PlataformaService } from '../../../core/plataforma/plataforma.service';

export type ParadaSheet = 'espiar' | 'meio' | 'cheio';

/** Quanto o dedo precisa arrastar (px) para trocar de parada ou fechar. */
const LIMIAR = 48;

/**
 * Painel que sobe da base da tela, como nos apps de celular.
 *
 * - `modo="modal"` (padrão): abre por cima de um fundo escuro; arrastar a alça para baixo, tocar no fundo,
 *   Esc ou o botão voltar do Android fecham (`fechar`). Sem `parada`, a altura acompanha o conteúdo.
 * - `modo="fixo"`: fica sempre na tela, sem fundo, e o dedo alterna entre as paradas `espiar`, `meio` e
 *   `cheio` (ex.: a lista de tokens embaixo do mapa). O botão voltar recolhe para `espiar`.
 *
 * No desktop, `desktop="dialogo"` mostra o modal centralizado, como os diálogos de sempre.
 *
 * Uso: `<app-bottom-sheet [aberto]="x()" (fechar)="x.set(false)" titulo="Dados">...</app-bottom-sheet>`
 */
@Component({
  selector: 'app-bottom-sheet',
  templateUrl: './bottom-sheet.html',
  styleUrl: './bottom-sheet.scss',
  host: {
    '[class.fixo]': "modo() === 'fixo'",
    '[class.desktop-dialogo]': "desktop() === 'dialogo'",
  },
})
export class BottomSheet {
  private layout = inject(LayoutService);
  private plataforma = inject(PlataformaService);

  readonly aberto = input(true, { transform: booleanAttribute });
  readonly modo = input<'modal' | 'fixo'>('modal');
  readonly desktop = input<'sheet' | 'dialogo'>('sheet');
  readonly titulo = input<string>('');
  /** Paradas que o dedo pode alcançar (modo fixo). */
  readonly paradas = input<ParadaSheet[]>(['espiar', 'meio', 'cheio']);
  /** Parada atual; vazia no modal = altura do conteúdo. */
  readonly parada = model<ParadaSheet | null>(null);
  readonly fechar = output<void>();

  private painel = viewChild<ElementRef<HTMLElement>>('painel');

  /** Deslocamento do dedo durante o arrasto (px, positivo = para baixo). */
  protected readonly arrasto = signal(0);
  protected readonly arrastando = signal(false);
  protected readonly visivel = computed(() => this.modo() === 'fixo' || this.aberto());

  private inicioY = 0;
  private pressionado = false;
  /** O último toque foi um arrasto: o clique que vem junto não conta. */
  private moveu = false;
  private soltarCamada: (() => void) | null = null;
  private focoAnterior: HTMLElement | null = null;

  constructor() {
    // Botão voltar do Android: o modal fecha; o fixo recolhe (só quando está levantado).
    effect(() => {
      const modal = this.modo() === 'modal';
      const precisa = modal ? this.aberto() : (this.parada() ?? 'espiar') !== this.paradas()[0];
      untracked(() => {
        if (precisa && !this.soltarCamada) {
          this.soltarCamada = this.layout.abrirCamada(() => {
            this.soltarCamada = null;
            if (modal) this.fechar.emit();
            else this.parada.set(this.paradas()[0]);
          });
        } else if (!precisa && this.soltarCamada) {
          this.soltarCamada();
          this.soltarCamada = null;
        }
      });
    });

    // Foco entra no painel ao abrir o modal e volta para onde estava ao fechar.
    effect(() => {
      if (this.modo() !== 'modal') return;
      if (this.aberto()) {
        this.focoAnterior = document.activeElement as HTMLElement | null;
        setTimeout(() => this.painel()?.nativeElement.focus());
      } else if (this.focoAnterior) {
        this.focoAnterior.focus?.();
        this.focoAnterior = null;
      }
    });

    inject(DestroyRef).onDestroy(() => this.soltarCamada?.());
  }

  protected pegar(evento: PointerEvent) {
    if (evento.button !== 0) return;
    this.inicioY = evento.clientY;
    this.pressionado = true;
  }

  protected mover(evento: PointerEvent) {
    if (!this.pressionado) return;
    const dy = evento.clientY - this.inicioY;
    // Só vira arrasto depois de alguns pixels: antes disso, botões do cabeçalho (fechar, ações) recebem o clique.
    if (!this.arrastando()) {
      if (Math.abs(dy) < 6) return;
      this.arrastando.set(true);
      (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    }
    // no modal só desce; no fixo sobe com resistência
    this.arrasto.set(this.modo() === 'modal' ? Math.max(0, dy) : dy > 0 ? dy : dy / 2);
  }

  protected soltar() {
    this.pressionado = false;
    if (!this.arrastando()) return;
    const dy = this.arrasto();
    this.moveu = Math.abs(dy) > 6;
    this.arrastando.set(false);
    this.arrasto.set(0);

    if (this.modo() === 'modal') {
      if (dy > LIMIAR) this.fechar.emit();
      return;
    }

    const lista = this.paradas();
    const atual = Math.max(0, lista.indexOf(this.parada() ?? lista[0]));
    if (dy < -LIMIAR && atual < lista.length - 1) this.irPara(lista[atual + 1]);
    else if (dy > LIMIAR && atual > 0) this.irPara(lista[atual - 1]);
  }

  /** Toque na alça do fixo (sem arrastar): alterna entre a primeira e a próxima parada. */
  protected tocarAlca() {
    if (this.moveu) {
      this.moveu = false;
      return;
    }
    if (this.modo() !== 'fixo') return;
    const lista = this.paradas();
    this.irPara((this.parada() ?? lista[0]) === lista[0] ? lista[1] ?? lista[0] : lista[0]);
  }

  protected teclar(evento: KeyboardEvent) {
    if (evento.key === 'Escape' && this.modo() === 'modal') {
      evento.preventDefault();
      this.fechar.emit();
      return;
    }
    if (evento.key !== 'Tab' || this.modo() !== 'modal') return;

    // Tab fica preso dentro do modal
    const focaveis = Array.from(
      this.painel()?.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  private irPara(parada: ParadaSheet) {
    if (parada === this.parada()) return;
    this.parada.set(parada);
    this.plataforma.vibrar('leve');
  }
}
