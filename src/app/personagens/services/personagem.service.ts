import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { EscolhasDeNivel, Personagem, ProximoNivel, ResultadoSubida } from '../models/personagem';
import { ResultadoDescanso } from '../utils/regras-descanso';
import { ContagemPorCampanha, Pagina, TAMANHO_PAGINA, paramsDe } from '../../shared/models/pagina';

/** Página do elenco: `totalHerois` e `totalMonstros` contam as abas; `porCampanha`, os filtros da aba pedida. */
export interface PaginaDePersonagens extends Pagina<Personagem> {
  totalHerois: number;
  totalMonstros: number;
  porCampanha: ContagemPorCampanha[];
}

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

  /** O elenco paginado de uma aba, com as contagens das abas e de cada campanha. */
  getPagina(filtro: { pagina: number; tipo: 'herois' | 'monstros'; busca?: string; campanhaId?: number | null }, tamanho = TAMANHO_PAGINA) {
    return this.http.get<PaginaDePersonagens>(`${this.apiUrl}/pagina`, {
      params: paramsDe({ pagina: filtro.pagina, tamanho, tipo: filtro.tipo, busca: filtro.busca?.trim(), campanhaId: filtro.campanhaId }),
    });
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

  /** O que muda no próximo nível (regras do D&D 2024) e se já dá para subir. */
  proximoNivel(id: number) {
    return this.http.get<ProximoNivel>(`${this.apiUrl}/${id}/proximo-nivel`);
  }

  /** Sobe um nível com as escolhas do jogador. Só depois que o Mestre liberou (por XP ou marco). */
  subirNivel(id: number, escolhas: EscolhasDeNivel) {
    return this.http.post<ResultadoSubida>(`${this.apiUrl}/${id}/subir-nivel`, escolhas);
  }

  /** Só o Mestre: muda o XP e/ou libera um nível por marco. */
  atualizarProgressao(id: number, progressao: { xp?: number; nivelLiberado?: number }) {
    return this.http.put<Personagem>(`${this.apiUrl}/${id}/progressao`, progressao);
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
