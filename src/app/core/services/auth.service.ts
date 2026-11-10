import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
  /** 0 = sem foto; sobe a cada foto nova. */
  fotoVersao: number;
  /** Conta Mestre com vaga no plano (ou qualquer conta no beta). O servidor confere de novo ao criar. */
  podeCriarCampanha: boolean;
}

/** Resposta de login/cadastro: o `token` só vem para o app nativo; na web ele fica num cookie HttpOnly. */
type RespostaAuth = UsuarioLogado & { token?: string; refreshToken?: string };

/** ok: sessão renovada; expirada: o servidor recusou o refresh (login de novo); indisponivel: rede/servidor, tente depois. */
export type ResultadoRenovacao = 'ok' | 'expirada' | 'indisponivel';

const CHAVE_TOKEN_NATIVO = 'wyvern_token';
const CHAVE_REFRESH_NATIVO = 'wyvern_refresh';
// Só um carimbo de hora (nada sensível): avisa as outras abas de que o refresh acabou de ser trocado.
const CHAVE_RENOVADO_EM = 'wyvern_renovado_em';
const JANELA_RENOVACAO_MS = 8000;
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
  private refreshNativo: string | null = null;
  private renovando: Promise<ResultadoRenovacao> | null = null;

  readonly usuarioLogado = this.usuario.asReadonly();

  constructor(private http: HttpClient) {}

  /** Roda antes de a primeira rota abrir (provideAppInitializer), para o guard e a navbar já saberem se há sessão. */
  async carregarSessao(): Promise<void> {
    this.limparChavesAntigas();

    if (this.nativo) {
      this.tokenNativo = await this.lerGuardado(CHAVE_TOKEN_NATIVO);
      this.refreshNativo = await this.lerGuardado(CHAVE_REFRESH_NATIVO);
      if (!this.tokenNativo && !this.refreshNativo) return;
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

  /** O cadastro não abre sessão e responde igual com e-mail novo ou já usado; o resultado chega por e-mail. */
  register(credentials: unknown): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/register`, credentials, { headers: this.cabecalhosDeEntrada() });
  }

  /** Esqueci a senha: responde igual exista a conta ou não; o link chega por e-mail. */
  esqueciSenha(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/esqueci-senha`, { email }, { headers: this.cabecalhosDeEntrada() });
  }

  /** Troca a senha com o token do link; o servidor encerra as sessões abertas da conta. */
  redefinirSenha(token: string, novaSenha: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/redefinir-senha`, { token, novaSenha }, { headers: this.cabecalhosDeEntrada() });
  }

  /** Confirma o e-mail com o token do link enviado; depois disso o login funciona. */
  /** Link enviado ao e-mail novo pela tela de perfil; funciona com ou sem sessão aberta. */
  confirmarTrocaEmail(token: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/confirmar-troca-email`, { token }, { headers: this.cabecalhosDeEntrada() });
  }

  /** Depois de salvar algo no perfil: a barra lateral e o resto do app veem o nome e a foto novos na hora. */
  atualizarUsuario(mudancas: Partial<Omit<UsuarioLogado, 'usuarioId'>>): void {
    this.usuario.update(atual => (atual ? { ...atual, ...mudancas } : atual));
  }

  confirmarEmail(token: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/confirmar-email`, { token }, { headers: this.cabecalhosDeEntrada() });
  }

  logout(): void {
    const tinhaSessao = this.usuario() !== null || this.tokenNativo !== null || this.refreshNativo !== null;
    this.usuario.set(null);
    if (!tinhaSessao) return;

    // O servidor revoga o refresh token e apaga os cookies; se a chamada falhar, a sessão local já foi encerrada.
    // No app nativo não há cookie: o refresh token vai no corpo para ser revogado.
    const corpo = this.nativo ? { refreshToken: this.refreshNativo } : null;
    this.http.post(`${this.apiUrl}/logout`, corpo).pipe(catchError(() => of(null))).subscribe();
    if (this.nativo) this.esquecerTokenNativo();
  }

  /**
   * Troca o refresh token por uma sessão nova. Chamadas simultâneas desta aba dividem a mesma troca; entre abas o
   * Web Locks serializa e quem chega depois só confere se outra aba acabou de renovar (o cookie é compartilhado).
   * Sem isso, duas abas usariam o mesmo refresh token e a segunda seria tratada como reuso.
   */
  renovarSessao(): Promise<ResultadoRenovacao> {
    this.renovando ??= this.comTrancaEntreAbas(() => this.trocarRefreshToken()).finally(() => (this.renovando = null));
    return this.renovando;
  }

  /** Antes de abrir um hub na web: o cookie de acesso dura minutos e o handshake do hub não tem como renová-lo. */
  async garantirSessaoParaHub(): Promise<void> {
    if (this.nativo) return; // o app pede um ticket a cada conexão, e essa chamada já renova a sessão
    await firstValueFrom(this.http.get(`${this.apiUrl}/me`).pipe(catchError(() => of(null))));
  }

  private async comTrancaEntreAbas<T>(tarefa: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    return locks ? locks.request('wyvern-renovar-sessao', tarefa) : tarefa();
  }

  private async trocarRefreshToken(): Promise<ResultadoRenovacao> {
    if (this.nativo && !this.refreshNativo) return 'expirada';
    if (!this.nativo && this.outraAbaRenovouAgora()) return 'ok';

    try {
      const resposta = await firstValueFrom(
        this.http.post<RespostaAuth>(`${this.apiUrl}/refresh`, this.nativo ? { refreshToken: this.refreshNativo } : null)
      );
      this.iniciarSessao(resposta);
      this.marcarRenovacao();
      return 'ok';
    } catch (erro) {
      if (erro instanceof HttpErrorResponse && erro.status === 401) {
        // A outra aba pode ter ganho a corrida segundos antes: o cookie novo já vale, então não é fim de sessão.
        if (!this.nativo && this.outraAbaRenovouAgora()) return 'ok';
        return 'expirada';
      }
      return 'indisponivel';
    }
  }

  private outraAbaRenovouAgora(): boolean {
    try {
      return Date.now() - Number(localStorage.getItem(CHAVE_RENOVADO_EM) ?? 0) < JANELA_RENOVACAO_MS;
    } catch {
      return false;
    }
  }

  private marcarRenovacao(): void {
    try {
      localStorage.setItem(CHAVE_RENOVADO_EM, String(Date.now()));
    } catch {
      // sem armazenamento: só perde a otimização entre abas
    }
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
    if (this.nativo && resposta.refreshToken) {
      this.refreshNativo = resposta.refreshToken;
      void SecureStoragePlugin.set({ key: CHAVE_REFRESH_NATIVO, value: resposta.refreshToken }).catch(() => {});
    }
    this.usuario.set(this.semToken(resposta));
  }

  private semToken(resposta: RespostaAuth): UsuarioLogado {
    const { usuarioId, nome, email, papel, fotoVersao, podeCriarCampanha } = resposta;
    return { usuarioId, nome, email, papel, fotoVersao: fotoVersao ?? 0, podeCriarCampanha: podeCriarCampanha ?? true };
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

  private async lerGuardado(chave: string): Promise<string | null> {
    try {
      return (await SecureStoragePlugin.get({ key: chave })).value || null;
    } catch {
      return null; // a chave ainda não existe
    }
  }

  private esquecerTokenNativo(): void {
    this.tokenNativo = null;
    this.refreshNativo = null;
    void SecureStoragePlugin.remove({ key: CHAVE_TOKEN_NATIVO }).catch(() => {});
    void SecureStoragePlugin.remove({ key: CHAVE_REFRESH_NATIVO }).catch(() => {});
  }
}
