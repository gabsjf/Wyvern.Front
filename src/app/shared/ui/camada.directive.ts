import { DestroyRef, Directive, inject, output } from '@angular/core';
import { LayoutService } from '../../core/layout/layout.service';

/**
 * Faz um modal já existente fechar com o botão voltar do Android. Ponha no elemento que só existe enquanto o
 * modal está aberto: `<div class="modal-overlay" appCamada (fecharCamada)="aberto = false">`.
 */
@Directive({ selector: '[appCamada]' })
export class Camada {
  readonly fecharCamada = output<void>();

  constructor() {
    const soltar = inject(LayoutService).abrirCamada(() => this.fecharCamada.emit());
    inject(DestroyRef).onDestroy(soltar);
  }
}
