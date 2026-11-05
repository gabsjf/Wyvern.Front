import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import type { IHttpConnectionOptions } from '@microsoft/signalr';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { Observable, catchError, firstValueFrom, of, tap } from 'rxjs';
import { environment } from '../../../environments/environments';

export interface UsuarioLogado {
  usuarioId: number;
  nome: string;
  email: string;
  papel: string;
}

/** Resposta de login/cadastro: o `token` só vem para o app nativo; na web ele fica num cookie HttpOnly. */
type RespostaAuth = UsuarioLogado & { token?: string };

const CHAVE_TOKEN_NATIVO = 'wyvern_token';
// Antes de o token ir para o cookie ele ficava aqui, ao alcance de qualquer script da página.
const CHAVES_ANTIGAS = ['token', 'usuarioId', 'papel'];

/**
 * Na web a sessão é um cookie HttpOnly que só o servidor enxerga: o front descobre quem está logado perguntando
 * à API (`/Auth/me`). No app Android (outra origem, sem cookie) o token vem no corpo do login e fica no
 * armazenamento seguro do aparelho.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /** O app Android usa Bearer; a web usa o cookie. */
  get nativo(): boolean {
    return Capacitor.isNativePlatform();
  }

  private apiUrl = `${environment.apiUrl}/Auth`;
  private usuario = signal<UsuarioLogado | null>(null);
  private tokenNativo: string | null = null;

  readonly usuarioLogado = this.usuario.asReadonly();

  constructor(private http: HttpClient) {}

  /** Roda antes de a primeira rota abrir (provideAppInitializer), para o guard e a navbar já saberem se há sessão. */
  async carregarSessao(): Promise<void> {
    this.limparChavesAntigas();

    if (this.nativo) {
      this.tokenNativo = await this.lerTokenNativo();
      if (!this.tokenNativo) return;
    }

    const usuario = await firstValueFrom(this.http.get<RespostaAuth>(`${this.apiUrl}/me`).pipe(catchError(() => of(null))));
    this.usuario.set(usuario ? this.semToken(usuario) : null);
    if (!usuario && this.nativo) this.esquecerTokenNativo();
  }

  login(credentials: unknown): Observable<RespostaAuth> {
    return this.http.post<RespostaAuth>(`${this.apiUrl}/login`, credentials, { headers: this.cabecalhosDeEntrada() }).pipe(
      tap(resposta => this.iniciarSessao(resposta))
    );
  }

  register(credentials: unknown): Observable<RespostaAuth> {
    return this.http.post<RespostaAuth>(`${this.apiUrl}/register`, credentials, { headers: this.cabecalhosDeEntrada() }).pipe(
      tap(resposta => this.iniciarSessao(resposta))
    );
  }

  logout(): void {
    const tinhaSessao = this.usuario() !== null || this.tokenNativo !== null;
    this.usuario.set(null);
    if (!tinhaSessao) return;

    // O servidor apaga o cookie; se a chamada falhar, a sessão local já foi encerrada.
    this.http.post(`${this.apiUrl}/logout`, null).pipe(catchError(() => of(null))).subscribe();
    if (this.nativo) this.esquecerTokenNativo();
  }

  isLoggedIn(): boolean {
    return this.usuario() !== null;
  }

  /** Token para o cabeçalho Authorization. Só existe no app nativo; na web a API lê o cookie. */
  tokenParaApi(): string | null {
    return this.tokenNativo;
  }

  /**
   * Como cada conexão SignalR se autentica: pelo cookie na web; no app nativo (o WebSocket não manda cabeçalho) por um
   * ticket de ~60 s que a API emite a cada conexão, para o token da sessão nunca ir na URL.
   */
  opcoesDoHub(): IHttpConnectionOptions {
    return this.nativo
      ? { accessTokenFactory: () => this.pedirTicketDoHub() }
      : { withCredentials: true };
  }

  private async pedirTicketDoHub(): Promise<string> {
    const { ticket } = await firstValueFrom(this.http.post<{ ticket: string }>(`${this.apiUrl}/hub-ticket`, null));
    return ticket;
  }

  private iniciarSessao(resposta: RespostaAuth): void {
    if (this.nativo && resposta.token) {
      this.tokenNativo = resposta.token;
      void SecureStoragePlugin.set({ key: CHAVE_TOKEN_NATIVO, value: resposta.token }).catch(() => {});
    }
    this.usuario.set(this.semToken(resposta));
  }

  private semToken(resposta: RespostaAuth): UsuarioLogado {
    const { usuarioId, nome, email, papel } = resposta;
    return { usuarioId, nome, email, papel };
  }

  private cabecalhosDeEntrada(): HttpHeaders {
    return this.nativo ? new HttpHeaders({ 'X-Wyvern-Client': 'native' }) : new HttpHeaders();
  }

  private limparChavesAntigas(): void {
    try {
      for (const chave of CHAVES_ANTIGAS) localStorage.removeItem(chave);
    } catch {
      // sem armazenamento: não há o que limpar
    }
  }

  private async lerTokenNativo(): Promise<string | null> {
    try {
      return (await SecureStoragePlugin.get({ key: CHAVE_TOKEN_NATIVO })).value || null;
    } catch {
      return null; // a chave ainda não existe
    }
  }

  private esquecerTokenNativo(): void {
    this.tokenNativo = null;
    void SecureStoragePlugin.remove({ key: CHAVE_TOKEN_NATIVO }).catch(() => {});
  }
}
