import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { Sessao } from '../models/sessao';
import { ContagemPorCampanha, Pagina, TAMANHO_PAGINA, paramsDe } from '../../shared/models/pagina';

export interface PaginaDeSessoes extends Pagina<Sessao> {
  porCampanha: ContagemPorCampanha[];
}

@Injectable({
  providedIn: 'root',
})
export class SessaoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Sessao`;

  getAll() {
    return this.http.get<Sessao[]>(this.apiUrl);
  }

  /** O diário paginado: por campanha e, dentro dela, da mais nova para a mais antiga. */
  getPagina(pagina: number, campanhaId: number | null = null, tamanho = TAMANHO_PAGINA) {
    return this.http.get<PaginaDeSessoes>(`${this.apiUrl}/pagina`, { params: paramsDe({ pagina, tamanho, campanhaId }) });
  }
  getById(id: number) {
    return this.http.get<Sessao>(`${this.apiUrl}/${id}`);
  }
  create(sessao: Sessao) {
    return this.http.post<Sessao>(this.apiUrl, sessao);
  }
  update(id: number, sessao: Sessao) {
    return this.http.put<Sessao>(`${this.apiUrl}/${id}`, sessao);
  }
  delete(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
