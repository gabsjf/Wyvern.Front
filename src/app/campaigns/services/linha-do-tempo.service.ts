import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environments';
import { SessaoService } from '../../sessoes/services/sessao.service';
import { EventoCampanha, EventoCampanhaApi, EventoForm, SessaoResumo } from '../models/evento-campanha';

/** A crônica da campanha: os eventos escritos pelos membros e os que o sistema registra sozinho. */
@Injectable({ providedIn: 'root' })
export class LinhaDoTempoService {
  private http = inject(HttpClient);
  private sessoes = inject(SessaoService);

  private url(campanhaId: number) {
    return `${environment.apiUrl}/Campanha/${campanhaId}/Eventos`;
  }

  /** O servidor já esconde dos jogadores o que é só do Mestre. */
  listar(campanhaId: number): Observable<EventoCampanha[]> {
    return this.http.get<EventoCampanhaApi[]>(this.url(campanhaId)).pipe(map(lista => lista.map(e => this.completar(e))));
  }

  /** As sessões da campanha (para agrupar a crônica "pela mesa"), da mais antiga para a mais nova. */
  sessoesDa(campanhaId: number): Observable<SessaoResumo[]> {
    return this.sessoes.getAll().pipe(
      map(lista => lista
        .filter(s => s.campanhaId === campanhaId && s.sessaoId !== undefined)
        .sort((a, b) => a.numeroSessao - b.numeroSessao)
        .map(s => ({ sessaoId: s.sessaoId!, numero: s.numeroSessao, nome: s.nome, data: s.dataSessao }))),
    );
  }

  criar(campanhaId: number, dados: EventoForm): Observable<EventoCampanha> {
    return this.http.post<EventoCampanhaApi>(this.url(campanhaId), dados).pipe(map(e => this.completar(e)));
  }

  atualizar(campanhaId: number, eventoId: number, dados: EventoForm): Observable<EventoCampanha> {
    return this.http.put<EventoCampanhaApi>(`${this.url(campanhaId)}/${eventoId}`, dados).pipe(map(e => this.completar(e)));
  }

  remover(campanhaId: number, eventoId: number): Observable<void> {
    return this.http.delete<void>(`${this.url(campanhaId)}/${eventoId}`);
  }

  private completar(e: EventoCampanhaApi): EventoCampanha {
    let usuarioId: number | null = null;
    try {
      usuarioId = Number(localStorage.getItem('usuarioId')) || null;
    } catch {
      // sem armazenamento: ninguém é "você" (o servidor continua validando tudo)
    }
    return { ...e, autorEhVoce: usuarioId !== null && e.autorId === usuarioId };
  }
}
