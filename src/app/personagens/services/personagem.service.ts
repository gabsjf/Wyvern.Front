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
}
