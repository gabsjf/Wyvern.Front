import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { Personagem } from '../models/personagem';

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
}
