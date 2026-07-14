import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Anotacao {
    anotacaoId: number;
    campanhaId: number;
    pastaId?: number;
    titulo: string;
    conteudo: string;
    isPublica: boolean;
    criadoEm: string;
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
  private apiUrl = 'https://localhost:7098/Anotacao'; // TODO: config

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
