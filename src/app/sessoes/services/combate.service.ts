import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments';

@Injectable({
  providedIn: 'root'
})
export class CombateService {
  private apiUrl = `${environment.apiUrl}/combate`;

  constructor(private http: HttpClient) {}

  getActiveCombat(campanhaId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/active/${campanhaId}`);
  }

  getActiveCombatBySessao(sessaoId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/active/sessao/${sessaoId}`);
  }

  getParticipantes(combateId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${combateId}/participantes`);
  }

  startCombate(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/start`, data);
  }

  endCombate(combateId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${combateId}/end`, {});
  }

  nextTurn(combateId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${combateId}/next-turn`, {});
  }

  updateParticipante(combateId: number, participanteId: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${combateId}/participantes/${participanteId}`, data);
  }
}
