import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlataformaService } from '../../../core/plataforma/plataforma.service';

/**
 * Botão flutuante da ação principal da tela no celular ("Nova campanha", "Novo personagem"), no canto de
 * baixo, ao alcance do polegar. No desktop não aparece: a tela já tem o botão no cabeçalho.
 *
 * `<app-fab rotulo="Nova campanha" link="/campaigns/create" />` ou `<app-fab rotulo="Adicionar" (acionar)="...">`.
 */
@Component({
  selector: 'app-fab',
  imports: [RouterLink],
  template: `
    @if (link(); as destino) {
      <a class="fab" [routerLink]="destino" (click)="tocar()">
        <i class="bi {{ icone() }}" aria-hidden="true"></i><span>{{ rotulo() }}</span>
      </a>
    } @else {
      <button type="button" class="fab" (click)="tocar(); acionar.emit()">
        <i class="bi {{ icone() }}" aria-hidden="true"></i><span>{{ rotulo() }}</span>
      </button>
    }
  `,
  styles: `
    @use 'mobile';

    :host { display: none; }

    @include mobile.celular {
      :host { display: contents; }
    }

    .fab {
      position: fixed;
      right: max(1rem, var(--seguro-dir));
      bottom: calc(var(--barra-inferior) + var(--seguro-base) + 1rem);
      z-index: 800;
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      min-height: 56px;
      padding: 0 1.35rem 0 1.15rem;
      border: 0;
      border-radius: 16px;
      background: var(--accent);
      color: var(--accent-fg);
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-decoration: none;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      cursor: pointer;
      transition: transform 0.12s ease;

      i { font-size: 1.35rem; }
      &:active { transform: scale(0.96); }
    }

    :host-context(html.teclado-aberto) .fab { display: none; }
  `,
})
export class Fab {
  private plataforma = inject(PlataformaService);

  readonly rotulo = input.required<string>();
  readonly icone = input('bi-plus-lg');
  readonly link = input<string | null>(null);
  readonly acionar = output<void>();

  tocar() {
    this.plataforma.vibrar('leve');
  }
}
