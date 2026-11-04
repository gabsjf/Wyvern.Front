import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { Personagem } from '../models/personagem';
import { ResultadoDescanso } from '../utils/regras-descanso';

/** Mudança parcial no estado de jogo da ficha: só o que vier preenchido é alterado. */
export interface EstadoParcial {
  vidaAtual?: number;
  vidaTemporaria?: number;
  inspiracaoHeroica?: boolean;
  deathSaveSucessos?: number;
  deathSaveFalhas?: number;
  /** Condições ativas, separadas por vírgula. */
  condicoes?: string;
  /** Espaços de magia não gastos, do 1º ao 9º nível. */
  espacosAtuais?: number[];
}

@Injectable({
  providedIn: 'root',
})
export class PersonagemService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Personagem`;

  getAll() {
    return this.http.get<Personagem[]>(this.apiUrl);
  }
  getPericias() {
    return this.http.get<any[]>(`${environment.apiUrl}/Pericia`);
  }
  getById(id: number) {
    return this.http.get<Personagem>(`${this.apiUrl}/${id}`);
  }
  create(personagem: Personagem) {
    return this.http.post<Personagem>(this.apiUrl, personagem);
  }
  update(id: number, personagem: Personagem) {
    return this.http.put<Personagem>(`${this.apiUrl}/${id}`, personagem);
  }
  delete(id: number){
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  addItem(personagemId: number, item: any) {
    return this.http.post(`${this.apiUrl}/${personagemId}/items`, item);
  }

  removeItem(personagemId: number, itemId: number) {
    return this.http.delete(`${this.apiUrl}/${personagemId}/items/${itemId}`);
  }

  addMagia(personagemId: number, magia: any) {
    return this.http.post(`${this.apiUrl}/${personagemId}/magias`, magia);
  }

  removeMagia(personagemId: number, magiaId: number) {
    return this.http.delete(`${this.apiUrl}/${personagemId}/magias/${magiaId}`);
  }

  addAtaque(personagemId: number, ataque: any) {
    return this.http.post(`${this.apiUrl}/${personagemId}/ataques`, ataque);
  }

  removeAtaque(personagemId: number, ataqueId: number) {
    return this.http.delete(`${this.apiUrl}/${personagemId}/ataques/${ataqueId}`);
  }

  /** Copia a ficha inteira (na mesma campanha ou em outra onde o usuário é Mestre). */
  duplicar(id: number, opcoes: { campanhaId?: number; nome?: string } = {}) {
    return this.http.post<Personagem>(`${this.apiUrl}/${id}/duplicar`, opcoes);
  }

  /** Muda só o estado de jogo (PV, condições, espaços de magia...), sem reenviar a ficha inteira. */
  atualizarEstado(id: number, estado: EstadoParcial) {
    return this.http.put<Personagem>(`${this.apiUrl}/${id}/estado`, estado);
  }

  /** Registra o resultado de um descanso curto ou longo (já calculado; o servidor só confere os limites). */
  registrarDescanso(id: number, resultado: ResultadoDescanso) {
    return this.http.post<Personagem>(`${this.apiUrl}/${id}/descanso`, resultado);
  }

  importPdf(file: File, campanhaId: number) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('campanhaId', String(campanhaId));
    return this.http.post<Personagem>(`${this.apiUrl}/import-pdf`, formData);
  }

  exportPdf(id: number) {
    return this.http.get(`${this.apiUrl}/${id}/export-pdf`, { responseType: 'blob' });
  }
}
