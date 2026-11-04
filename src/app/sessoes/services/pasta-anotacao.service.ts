import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments';
import { PastaAnotacao } from '../models/pasta-anotacao.model';

@Injectable({
  providedIn: 'root'
})
export class PastaAnotacaoService {
  private apiUrl = environment.apiUrl + '/PastaAnotacao';

  constructor(private http: HttpClient) { }

  getPastasByCampanha(campanhaId: number): Observable<PastaAnotacao[]> {
    return this.http.get<PastaAnotacao[]>(`${this.apiUrl}/campanha/${campanhaId}`);
  }

  getPastaById(id: number): Observable<PastaAnotacao> {
    return this.http.get<PastaAnotacao>(`${this.apiUrl}/${id}`);
  }

  createPasta(pasta: PastaAnotacao): Observable<PastaAnotacao> {
    return this.http.post<PastaAnotacao>(this.apiUrl, pasta);
  }

  updatePasta(id: number, pasta: PastaAnotacao): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, pasta);
  }

  deletePasta(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
