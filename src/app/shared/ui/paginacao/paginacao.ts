import { Component, computed, input, output } from '@angular/core';

/** Um botão de página ou um "..." entre faixas. */
export type ItemDePaginacao = number | 'reticencias';

/**
 * Páginas a mostrar: sempre a primeira e a última, e a vizinhança da atual.
 * Ex.: atual 6 de 12 → 1 … 5 6 7 … 12. Com até 7 páginas, todas aparecem.
 */
export function paginasVisiveis(atual: number, total: number): ItemDePaginacao[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const inicio = Math.max(2, Math.min(atual - 1, total - 4));
  const fim = Math.min(total - 1, Math.max(atual + 1, 5));
  const itens: ItemDePaginacao[] = [1];
  if (inicio > 2) itens.push('reticencias');
  for (let p = inicio; p <= fim; p++) itens.push(p);
  if (fim < total - 1) itens.push('reticencias');
  itens.push(total);
  return itens;
}

/** Navegação entre páginas de uma lista. Some sozinha quando tudo cabe numa página. */
@Component({
  selector: 'app-paginacao',
  templateUrl: './paginacao.html',
  styleUrl: './paginacao.scss',
})
export class Paginacao {
  readonly pagina = input.required<number>();
  readonly totalPaginas = input.required<number>();
  readonly total = input.required<number>();
  readonly tamanhoPagina = input.required<number>();
  /** Como chamar os itens no "1–12 de 40 ...". */
  readonly rotulo = input('itens');

  readonly mudar = output<number>();

  readonly itens = computed(() => paginasVisiveis(this.pagina(), this.totalPaginas()));
  readonly primeiro = computed(() => (this.total() === 0 ? 0 : (this.pagina() - 1) * this.tamanhoPagina() + 1));
  readonly ultimo = computed(() => Math.min(this.total(), this.pagina() * this.tamanhoPagina()));

  ir(pagina: number) {
    if (pagina < 1 || pagina > this.totalPaginas() || pagina === this.pagina()) return;
    this.mudar.emit(pagina);
  }
}
