import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { Sessao } from '../models/sessao';

@Injectable({
  providedIn: 'root',
})
export class SessaoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Sessao`;

  getAll() {
    return this.http.get<Sessao[]>(this.apiUrl);
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
