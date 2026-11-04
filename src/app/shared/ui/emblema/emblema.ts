import { Component, computed, input } from '@angular/core';

let proximoId = 0;

// Cores heráldicas sóbrias: leem bem no tema escuro e no claro
const MATIZES = [350, 38, 95, 205, 275, 18, 170, 52];

/** Matiz (0-360) associado a um nome: o mesmo usado no brasão, para capas e fundos combinarem com ele. */
export function matizDoNome(nome: string): number {
  return MATIZES[hashDoNome(nome) % MATIZES.length];
}

function hashDoNome(nome: string): number {
  let h = 5381;
  for (const c of nome.toLowerCase()) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Brasão gerado a partir do nome (sempre o mesmo para o mesmo nome). Dá identidade visual a campanhas,
 * heróis e sessões sem depender de imagens enviadas.
 */
@Component({
  selector: 'app-emblema',
  template: `
    <svg [attr.viewBox]="forma() === 'escudo' ? '0 0 64 72' : '0 0 64 64'" [style.width.px]="tamanho()"
         [style.height.px]="forma() === 'escudo' ? tamanho() * 1.125 : tamanho()" role="img" [attr.aria-label]="'Brasão de ' + nome()">
      <defs>
        <clipPath [id]="id">
          @if (forma() === 'escudo') {
            <path d="M5 3H59V37C59 55 45 65 32 70C19 65 5 55 5 37Z" />
          } @else {
            <circle cx="32" cy="32" r="29" />
          }
        </clipPath>
      </defs>

      <g [attr.clip-path]="'url(#' + id + ')'">
        <rect width="64" height="72" [attr.fill]="base()" />
        @switch (padrao()) {
          @case (0) { <path d="M0 0H32V72H0Z" [attr.fill]="realce()" /> }
          @case (1) { <path d="M-4 52L68 14V30L-4 68Z" [attr.fill]="realce()" /> }
          @case (2) { <path d="M26 0H38V72H26Z M0 26H64V38H0Z" [attr.fill]="realce()" /> }
          @case (3) { <path d="M0 0H64V22H0Z" [attr.fill]="realce()" /> }
          @case (4) { <path d="M0 8L32 40L64 8V26L32 58L0 26Z" [attr.fill]="realce()" /> }
          @default { <path d="M0 0L64 72M64 0L0 72" [attr.stroke]="realce()" stroke-width="11" /> }
        }
        <rect width="64" height="72" fill="url(#brilho)" opacity="0" />
      </g>

      @if (forma() === 'escudo') {
        <path d="M5 3H59V37C59 55 45 65 32 70C19 65 5 55 5 37Z" fill="none" stroke="var(--hi)" stroke-width="2.4" />
      } @else {
        <circle cx="32" cy="32" r="29" fill="none" stroke="var(--hi)" stroke-width="2.4" />
      }

      <text x="32" [attr.y]="forma() === 'escudo' ? 42 : 41" text-anchor="middle" class="letra">{{ letra() }}</text>
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; flex: none; }
    svg { display: block; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35)); }
    .letra {
      font-family: var(--font-display);
      font-size: 28px;
      font-weight: 700;
      fill: #f6ead6;
      paint-order: stroke;
      stroke: rgba(0, 0, 0, 0.55);
      stroke-width: 3px;
    }
  `,
})
export class Emblema {
  nome = input.required<string>();
  tamanho = input(56);
  forma = input<'escudo' | 'redondo'>('escudo');

  protected id = `emblema-${proximoId++}`;

  private hash = computed(() => hashDoNome(this.nome()));

  protected letra = computed(() => (this.nome().trim()[0] ?? '?').toUpperCase());
  private matiz = computed(() => matizDoNome(this.nome()));
  protected padrao = computed(() => Math.floor(this.hash() / 8) % 6);
  protected base = computed(() => `hsl(${this.matiz()} 42% 22%)`);
  protected realce = computed(() => `hsl(${this.matiz()} 48% 36%)`);
}
