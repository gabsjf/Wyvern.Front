import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environments';
import { BibliotecaDeModelos, CategoriaModelo, Modelo3d, ObjetoCena, ObjetoCenaForm } from '../models/cena';
import { EscalaModelo } from '../utils/escala-3d';

/** Tamanho máximo de um .glb (o servidor confere de novo). */
export const TAMANHO_MAXIMO_GLB = 15 * 1024 * 1024;

/** Confere o cabeçalho de um .glb antes de enviar: "glTF", versão 2 e o tamanho declarado igual ao do arquivo. */
export function pareceGlb(cabecalho: ArrayBuffer, tamanhoDoArquivo: number): boolean {
  if (cabecalho.byteLength < 12) return false;
  const v = new DataView(cabecalho);
  const magico = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  return magico === 'glTF' && v.getUint32(4, true) === 2 && v.getUint32(8, true) === tamanhoDoArquivo;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Biblioteca de modelos 3D da campanha, peças de cenário nos mapas e miniaturas das fichas. */
@Injectable({ providedIn: 'root' })
export class Modelos3dService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Campanha`;
  /** Os bytes de um modelo nunca mudam: baixa uma vez por sessão do app. */
  private arquivos = new Map<string, Promise<ArrayBuffer>>();

  biblioteca(campanhaId: number) {
    return firstValueFrom(this.http.get<BibliotecaDeModelos>(`${this.apiUrl}/${campanhaId}/Modelos`));
  }

  enviar(campanhaId: number, arquivo: File, nome: string, categoria: CategoriaModelo, escala: EscalaModelo = 'Auto') {
    const form = new FormData();
    form.append('Arquivo', arquivo, arquivo.name || 'modelo.glb');
    form.append('Nome', nome);
    form.append('Categoria', categoria);
    form.append('Escala', escala);
    return firstValueFrom(this.http.post<Modelo3d>(`${this.apiUrl}/${campanhaId}/Modelos`, form));
  }

  /**
   * Troca o arquivo do modelo pela versão otimizada. Volta um modelo novo (outro id): peças, tokens e fichas que usavam
   * o antigo já passam a usar ele, e o antigo some.
   */
  substituir(campanhaId: number, modeloId: number, arquivo: File) {
    const form = new FormData();
    form.append('Arquivo', arquivo, arquivo.name || 'modelo.glb');
    this.arquivos.delete(`${campanhaId}/${modeloId}`);
    return firstValueFrom(this.http.post<Modelo3d>(`${this.apiUrl}/${campanhaId}/Modelos/${modeloId}/substituir`, form));
  }

  /** Renomear o modelo ou trocar a escala. */
  editar(campanhaId: number, modeloId: number, nome: string, escala: EscalaModelo) {
    return firstValueFrom(this.http.put<Modelo3d>(`${this.apiUrl}/${campanhaId}/Modelos/${modeloId}`, { nome, escala }));
  }

  apagar(campanhaId: number, modeloId: number) {
    this.arquivos.delete(`${campanhaId}/${modeloId}`);
    return firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${campanhaId}/Modelos/${modeloId}`));
  }

  /** O .glb exige login, então vem pelo HttpClient. Fica guardado na memória para os próximos usos. */
  arquivo(campanhaId: number, modeloId: number): Promise<ArrayBuffer> {
    const chave = `${campanhaId}/${modeloId}`;
    let pedido = this.arquivos.get(chave);
    if (!pedido) {
      pedido = firstValueFrom(this.http.get(`${this.apiUrl}/${campanhaId}/Modelos/${modeloId}/arquivo`, { responseType: 'arraybuffer' }));
      pedido.catch(() => this.arquivos.delete(chave)); // falhou: tenta de novo da próxima vez
      this.arquivos.set(chave, pedido);
    }
    return pedido;
  }

  // ---------- peças de cenário ----------

  private objetosUrl(campanhaId: number, cenaId: number) {
    return `${this.apiUrl}/${campanhaId}/Cenas/${cenaId}/objetos`;
  }

  objetos(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<ObjetoCena[]>(this.objetosUrl(campanhaId, cenaId)));
  }

  criarObjeto(campanhaId: number, cenaId: number, objeto: ObjetoCenaForm) {
    return firstValueFrom(this.http.post<ObjetoCena>(this.objetosUrl(campanhaId, cenaId), objeto));
  }

  editarObjeto(campanhaId: number, cenaId: number, objetoId: number, objeto: ObjetoCenaForm) {
    return firstValueFrom(this.http.put<ObjetoCena>(`${this.objetosUrl(campanhaId, cenaId)}/${objetoId}`, objeto));
  }

  apagarObjeto(campanhaId: number, cenaId: number, objetoId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.objetosUrl(campanhaId, cenaId)}/${objetoId}`));
  }

  // ---------- miniatura da ficha ----------

  definirMiniatura(personagemId: number, modeloId: number | null) {
    return firstValueFrom(this.http.put<{ modeloId: number | null }>(`${environment.apiUrl}/Personagem/${personagemId}/miniatura`, { modeloId }));
  }
}
