import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';

export interface Magia {
  magiaId?: number;
  nome: string;
  descricao?: string;
  nivel?: number;
  tempoConjuracao?: string;
  alcance?: string;
  duracao?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MagiaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Magia`;

  getAll() {
    return this.http.get<Magia[]>(this.apiUrl);
  }
}
