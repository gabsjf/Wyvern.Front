import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { PerfilService } from '../../../core/services/perfil.service';

/** Foto de perfil de quem está logado; sem foto (ou enquanto carrega), mostra as iniciais do nome. */
@Component({
  selector: 'app-avatar',
  template: `
    <span class="avatar" [style.width.px]="tamanho()" [style.height.px]="tamanho()" [style.font-size.px]="tamanho() * 0.4" aria-hidden="true">
      @if (url(); as src) {
        <img [src]="src" alt="" (error)="url.set(null)" />
      } @else {
        {{ iniciais() }}
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      overflow: hidden;
      background: var(--surface-2);
      color: var(--fg);
      border: 1px solid var(--line);
      font-family: var(--font-display);
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
      text-transform: uppercase;
      user-select: none;
    }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `,
})
export class Avatar {
  private perfil = inject(PerfilService);

  readonly nome = input('');
  readonly versao = input(0);
  readonly tamanho = input(36);

  readonly url = signal<string | null>(null);

  readonly iniciais = computed(() => {
    const partes = this.nome().trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
  });

  constructor() {
    effect(() => {
      const versao = this.versao();
      if (versao <= 0) {
        this.url.set(null);
        return;
      }
      void this.perfil.urlDaFoto(versao).then(u => {
        if (this.versao() === versao) this.url.set(u);
      });
    });
  }
}
