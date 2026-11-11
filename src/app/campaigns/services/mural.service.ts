import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environments';
import { MuralResumo, MuralSalvo } from '../models/mural';

/** Murais do Mestre (só ele acessa: a API responde 403 para jogadores). */
@Injectable({ providedIn: 'root' })
export class MuralService {
  private http = inject(HttpClient);

  private base(campanhaId: number) {
    return `${environment.apiUrl}/Campanha/${campanhaId}/Murais`;
  }

  listar(campanhaId: number) {
    return this.http.get<MuralResumo[]>(this.base(campanhaId));
  }

  criar(campanhaId: number, nome: string) {
    return this.http.post<MuralSalvo>(this.base(campanhaId), { nome });
  }

  obter(campanhaId: number, muralId: number) {
    return this.http.get<MuralSalvo>(`${this.base(campanhaId)}/${muralId}`);
  }

  /** Grava o documento inteiro; com versão desatualizada, a API responde 409. */
  salvar(campanhaId: number, muralId: number, dados: { nome: string; conteudo: string; versao: number }) {
    return this.http.put<{ versao: number; atualizadoEm: string }>(`${this.base(campanhaId)}/${muralId}`, dados);
  }

  excluir(campanhaId: number, muralId: number) {
    return this.http.delete<void>(`${this.base(campanhaId)}/${muralId}`);
  }

  enviarImagem(campanhaId: number, muralId: number, arquivo: Blob, nome = 'imagem') {
    const form = new FormData();
    form.append('Imagem', arquivo, nome);
    return this.http.post<{ imagemId: number }>(`${this.base(campanhaId)}/${muralId}/imagens`, form);
  }

  /** A imagem exige login, então não dá para pôr a URL direto num <img>: busca os bytes e cria um endereço local. */
  async imagem(campanhaId: number, muralId: number, imagemId: number): Promise<string> {
    const blob = await firstValueFrom(this.http.get(`${this.base(campanhaId)}/${muralId}/imagens/${imagemId}`, { responseType: 'blob' }));
    return URL.createObjectURL(blob);
  }
}
