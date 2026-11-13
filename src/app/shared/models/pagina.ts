import { HttpParams } from '@angular/common/http';

/** Uma página de uma lista da API. `pagina` começa em 1. */
export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  totalPaginas: number;
}

/** Quantos itens da lista são de cada campanha: os filtros da tela. */
export interface ContagemPorCampanha {
  campanhaId: number;
  nome: string;
  total: number;
}

/** Itens por página das listas (o servidor aceita até 48). */
export const TAMANHO_PAGINA = 12;

/** Monta a query string, pulando o que veio vazio. */
export function paramsDe(filtros: Record<string, string | number | null | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== null && valor !== undefined && valor !== '') params = params.set(chave, String(valor));
  }
  return params;
}

/** Número de página vindo da URL: inteiro a partir de 1, senão 1. */
export function paginaDaUrl(valor: string | null | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
