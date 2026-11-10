import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { environment } from '../../../environments/environments';
import { AuthService } from './auth.service';

export interface Perfil {
  usuarioId: number;
  nome: string;
  email: string;
  /** E-mail novo aguardando o clique no link; nulo se não há troca pendente. */
  emailPendente: string | null;
  papel: string;
  criadoEm: string;
  fotoVersao: number;
  conta: Conta;
}

/** Tipo de conta, plano, limites e uso. Limite nulo = sem limite. */
export interface Conta {
  tipo: 'Mestre' | 'Jogador';
  plano: string;
  nomePlano: string;
  /** No beta toda conta tem acesso completo de Mestre. */
  beta: boolean;
  podeCriarCampanha: boolean;
  motivoBloqueio: string | null;
  maxCampanhas: number | null;
  maxJogadoresPorCampanha: number | null;
  campanhasCriadas: number;
}

export interface PreviaDeExclusao {
  /** Campanhas de que a pessoa é dona e que passam para um co-Mestre. */
  transferidas: { campanha: string; novoDono: string }[];
  /** Campanhas de que é dona, sem co-Mestre: são encerradas para todos. */
  encerradas: string[];
}

export interface CatalogoDePlanos {
  beta: boolean;
  planos: { chave: string; nome: string; maxCampanhas: number | null; maxJogadoresPorCampanha: number | null }[];
}

/** Um aparelho conectado (uma sessão aberta num login). */
export interface SessaoAtiva {
  id: string;
  dispositivo: string;
  iniciadaEm: string;
  ultimaAtividadeEm: string;
  atual: boolean;
}

export const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024;
export const TIPOS_DE_FOTO = ['image/png', 'image/jpeg', 'image/webp'];

/** A conta de quem está logado: tela "Meu perfil" e a foto que aparece na barra lateral. */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = `${environment.apiUrl}/Usuario/me`;

  // A foto vem por HttpClient (no app nativo o <img> não levaria o Bearer); a URL local é dividida por quem pedir a mesma versão.
  private foto: { versao: number; url: Promise<string | null> } | null = null;

  obter(): Observable<Perfil> {
    return this.http.get<Perfil>(this.apiUrl).pipe(tap(p => this.sincronizar(p)));
  }

  alterarNome(nome: string): Observable<Perfil> {
    return this.http.put<Perfil>(`${this.apiUrl}/nome`, { nome }).pipe(tap(p => this.sincronizar(p)));
  }

  enviarFoto(arquivo: File): Observable<Perfil> {
    const form = new FormData();
    form.append('Foto', arquivo, arquivo.name);
    return this.http.put<Perfil>(`${this.apiUrl}/foto`, form).pipe(tap(p => this.sincronizar(p)));
  }

  removerFoto(): Observable<Perfil> {
    return this.http.delete<Perfil>(`${this.apiUrl}/foto`).pipe(tap(p => this.sincronizar(p)));
  }

  /** O servidor encerra as outras sessões; esta continua aberta. */
  trocarSenha(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/senha`, { senhaAtual, novaSenha });
  }

  /** Só manda o link para o e-mail novo; a troca vale depois do clique. */
  trocarEmail(novoEmail: string, senhaAtual: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/email`, { novoEmail, senhaAtual });
  }

  /** Conta Jogador passa a ser Mestre no plano Free. */
  virarMestre(): Observable<Conta> {
    return this.http.post<Conta>(`${this.apiUrl}/virar-mestre`, null).pipe(
      tap(c => this.auth.atualizarUsuario({ papel: c.tipo, podeCriarCampanha: c.podeCriarCampanha }))
    );
  }

  /** O que acontece com as campanhas da pessoa se ela excluir a conta agora. */
  previaDeExclusao(): Observable<PreviaDeExclusao> {
    return this.http.get<PreviaDeExclusao>(`${this.apiUrl}/exclusao`);
  }

  /** Exclui na hora; o servidor derruba todas as sessões e apaga os cookies. */
  excluirConta(senha: string, confirmacao: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/excluir`, { senha, confirmacao });
  }

  /** Público: se o beta está ativo e quais planos existem. */
  catalogo(): Observable<CatalogoDePlanos> {
    return this.http.get<CatalogoDePlanos>(`${environment.apiUrl}/Planos`);
  }

  sessoes(): Observable<SessaoAtiva[]> {
    return this.http.get<SessaoAtiva[]>(`${this.apiUrl}/sessoes`);
  }

  encerrarSessao(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/sessoes/${encodeURIComponent(id)}`);
  }

  encerrarOutrasSessoes(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/sessoes`);
  }

  /** URL local (blob:) da foto nesta versão, ou nulo se não há foto ou ela não carregou. */
  urlDaFoto(versao: number): Promise<string | null> {
    if (versao <= 0) return Promise.resolve(null);
    if (this.foto?.versao === versao) return this.foto.url;

    const anterior = this.foto;
    const url = firstValueFrom(this.http.get(`${this.apiUrl}/foto`, { params: { v: versao }, responseType: 'blob' }))
      .then(blob => URL.createObjectURL(blob))
      .catch(() => null);
    this.foto = { versao, url };
    // a versão antiga ainda pode estar na tela até o <img> trocar: libera um pouco depois
    void anterior?.url.then(u => u && setTimeout(() => URL.revokeObjectURL(u), 5000));
    return url;
  }

  private sincronizar(perfil: Perfil): void {
    this.auth.atualizarUsuario({
      nome: perfil.nome,
      email: perfil.email,
      fotoVersao: perfil.fotoVersao,
      papel: perfil.conta.tipo,
      podeCriarCampanha: perfil.conta.podeCriarCampanha,
    });
  }
}
