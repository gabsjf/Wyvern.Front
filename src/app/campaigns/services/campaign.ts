import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { Campaign, Convite, Membro } from '../models/campaign';

@Injectable({
  providedIn: 'root',
})
export class CampaignService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Campanha`;

  getAll() {
    return this.http.get<Campaign[]>(this.apiUrl);
  }
  getById(id: number) {
    return this.http.get<Campaign>(`${this.apiUrl}/${id}`);
  }
  create( campaign: Campaign) {
    return this.http.post<Campaign>(this.apiUrl, campaign);
  }
  update(id: number, campaign: Campaign) {
    return this.http.put<Campaign>(`${this.apiUrl}/${id}`, campaign);
  }
  delete(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }
  // Sem "renovar" devolve sempre o mesmo link; renovar=true troca o token e invalida o link anterior.
  generateInvite(id: number, renovar = false) {
    return this.http.post<Convite>(`${this.apiUrl}/${id}/generate-invite`, {}, { params: renovar ? { renovar: true } : {} });
  }
  revokeInvite(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}/invite`);
  }
  getMembros(id: number) {
    return this.http.get<Membro[]>(`${this.apiUrl}/${id}/membros`);
  }
  setPapel(id: number, usuarioId: number, papel: 'Mestre' | 'Jogador') {
    return this.http.put(`${this.apiUrl}/${id}/membros/${usuarioId}/papel`, { papel });
  }
  // O Mestre remove um membro; o próprio usuário usa a mesma chamada para sair da campanha.
  removeMembro(id: number, usuarioId: number) {
    return this.http.delete(`${this.apiUrl}/${id}/membros/${usuarioId}`);
  }
  join(token: string) {
    return this.http.post<{campanhaId: number}>(`${this.apiUrl}/join/${token}`, {});
  }
}
