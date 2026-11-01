import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments';

export interface Anotacao {
    anotacaoId: number;
    campanhaId: number;
    pastaId?: number;
    titulo: string;
    conteudo: string;
    isPublica: boolean;
    criadoEm: Date;
    criadoPorId: number;
}

export interface CreateAnotacaoDto {
    campanhaId: number;
    pastaId?: number;
    titulo: string;
    conteudo: string;
    isPublica: boolean;
}

export interface UpdateAnotacaoDto {
    titulo: string;
    conteudo: string;
    isPublica: boolean;
    pastaId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnotacaoService {
  private apiUrl = environment.apiUrl + '/Anotacao';

  constructor(private http: HttpClient) { }

  getAnotacoesByCampanha(campanhaId: number): Observable<Anotacao[]> {
    return this.http.get<Anotacao[]>(`${this.apiUrl}/campanha/${campanhaId}`);
  }

    create(dto: CreateAnotacaoDto): Observable<Anotacao> {
        return this.http.post<Anotacao>(this.apiUrl, dto);
    }

    update(id: number, dto: UpdateAnotacaoDto): Observable<any> {
        return this.http.put(`${this.apiUrl}/${id}`, dto);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
