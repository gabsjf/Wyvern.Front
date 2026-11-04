import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environments';
import { Cena, Marcador, MarcadorForm, MovimentoToken, Parede, ParedeForm, Traco, TokenCena, TokenForm } from '../models/cena';

export interface PingDoMapa {
  usuarioId: number;
  nome: string;
  cenaId: number;
  /** Pixels da imagem. */
  x: number;
  y: number;
}

/** A régua de outra pessoa, em quadrados. */
export interface ReguaDeOutro {
  usuarioId: number;
  nome: string;
  cenaId: number;
  c1: number;
  l1: number;
  c2: number;
  l2: number;
  ativa: boolean;
}

export interface NeblinaDoServidor {
  ativa: boolean;
  colunas: number;
  linhas: number;
  revelado: string;
}

/** O que o mapa ao vivo avisa. Cada função é opcional. */
export interface OuvintesDoMapa {
  /** Criar/trocar/apagar cena, ou trocar a cena em jogo: recarregar as cenas. */
  cenaAtualizada?: () => void;
  tokenAtualizado?: (token: TokenCena) => void;
  tokenMovido?: (movimento: MovimentoToken) => void;
  /** Um retângulo de quadrados foi revelado ou coberto pelo Mestre. */
  neblinaAlterada?: (n: { cenaId: number; coluna: number; linha: number; largura: number; altura: number; revelar: boolean }) => void;
  /** A névoa foi ligada, desligada ou coberta/revelada por inteiro: buscar de novo. */
  neblinaAtualizada?: (n: { cenaId: number }) => void;
  ping?: (p: PingDoMapa) => void;
  marcadorAtualizado?: (m: Marcador) => void;
  marcadorRemovido?: (r: { marcadorId: number; cenaId: number }) => void;
  tracoCriado?: (t: Traco) => void;
  tracoRemovido?: (r: { tracoId: number; cenaId: number }) => void;
  tracosLimpos?: (r: { cenaId: number }) => void;
  reguaCompartilhada?: (r: ReguaDeOutro) => void;
  /** Paredes ou portas mudaram: buscar de novo. */
  paredesAtualizadas?: (r: { cenaId: number }) => void;
  tokenRemovido?: (ref: { tokenId: number; cenaId: number }) => void;
  /** A conexão caiu e voltou: o que passou nesse intervalo precisa ser recarregado. */
  reconectou?: () => void;
}

/** API REST dos mapas e a conexão em tempo real (CenaHub) da campanha aberta. */
@Injectable({ providedIn: 'root' })
export class CenaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Campanha`;

  private conexao: signalR.HubConnection | undefined;
  private campanhaId: number | undefined;

  private base(campanhaId: number) {
    return `${this.apiUrl}/${campanhaId}/Cenas`;
  }

  // ---------- REST ----------

  listar(campanhaId: number) {
    return firstValueFrom(this.http.get<Cena[]>(this.base(campanhaId)));
  }

  criar(campanhaId: number, dados: { nome: string; largura: number; altura: number; tamanhoCelula: number; imagem: File; sessaoId?: number | null }) {
    const form = new FormData();
    form.append('Nome', dados.nome);
    form.append('Largura', String(dados.largura));
    form.append('Altura', String(dados.altura));
    form.append('TamanhoCelula', String(dados.tamanhoCelula));
    if (dados.sessaoId) form.append('SessaoId', String(dados.sessaoId));
    form.append('Imagem', dados.imagem, dados.imagem.name);
    return firstValueFrom(this.http.post<Cena>(this.base(campanhaId), form));
  }

  editar(campanhaId: number, cenaId: number, dados: {
    nome: string; tamanhoCelula: number; sessaoId: number | null; soNoTurno: boolean; metrosPorQuadrado: number; limitarDeslocamento: boolean;
  }) {
    return firstValueFrom(this.http.put<Cena>(`${this.base(campanhaId)}/${cenaId}`, dados));
  }

  duplicar(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.post<Cena>(`${this.base(campanhaId)}/${cenaId}/duplicar`, {}));
  }

  paredes(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<Parede[]>(`${this.base(campanhaId)}/${cenaId}/paredes`));
  }

  criarParede(campanhaId: number, cenaId: number, parede: ParedeForm) {
    return firstValueFrom(this.http.post<Parede>(`${this.base(campanhaId)}/${cenaId}/paredes`, parede));
  }

  editarParede(campanhaId: number, cenaId: number, paredeId: number, parede: ParedeForm) {
    return firstValueFrom(this.http.put<Parede>(`${this.base(campanhaId)}/${cenaId}/paredes/${paredeId}`, parede));
  }

  excluirParede(campanhaId: number, cenaId: number, paredeId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}/paredes/${paredeId}`));
  }

  marcadores(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<Marcador[]>(`${this.base(campanhaId)}/${cenaId}/marcadores`));
  }

  criarMarcador(campanhaId: number, cenaId: number, marcador: MarcadorForm) {
    return firstValueFrom(this.http.post<Marcador>(`${this.base(campanhaId)}/${cenaId}/marcadores`, marcador));
  }

  editarMarcador(campanhaId: number, cenaId: number, marcadorId: number, marcador: MarcadorForm) {
    return firstValueFrom(this.http.put<Marcador>(`${this.base(campanhaId)}/${cenaId}/marcadores/${marcadorId}`, marcador));
  }

  excluirMarcador(campanhaId: number, cenaId: number, marcadorId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}/marcadores/${marcadorId}`));
  }

  tracos(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<Traco[]>(`${this.base(campanhaId)}/${cenaId}/tracos`));
  }

  criarTraco(campanhaId: number, cenaId: number, traco: Pick<Traco, 'cor' | 'espessura' | 'pontos'>) {
    return firstValueFrom(this.http.post<Traco>(`${this.base(campanhaId)}/${cenaId}/tracos`, traco));
  }

  excluirTraco(campanhaId: number, cenaId: number, tracoId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}/tracos/${tracoId}`));
  }

  limparTracos(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}/tracos`));
  }

  /** O retrato também exige login: busca os bytes e cria um endereço local, como no mapa. */
  async retrato(campanhaId: number, cenaId: number, tokenId: number): Promise<string> {
    const blob = await firstValueFrom(this.http.get(`${this.base(campanhaId)}/${cenaId}/tokens/${tokenId}/imagem`, { responseType: 'blob' }));
    return URL.createObjectURL(blob);
  }

  enviarRetrato(campanhaId: number, cenaId: number, tokenId: number, imagem: Blob) {
    const form = new FormData();
    form.append('Imagem', imagem, 'retrato.webp');
    return firstValueFrom(this.http.put<TokenCena>(`${this.base(campanhaId)}/${cenaId}/tokens/${tokenId}/imagem`, form));
  }

  removerRetrato(campanhaId: number, cenaId: number, tokenId: number) {
    return firstValueFrom(this.http.delete<TokenCena>(`${this.base(campanhaId)}/${cenaId}/tokens/${tokenId}/imagem`));
  }

  ativar(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.post<Cena>(`${this.base(campanhaId)}/${cenaId}/ativar`, {}));
  }

  excluir(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}`));
  }

  /** A imagem exige login, então não dá para usar a URL direto num <img>: busca os bytes e cria um endereço local. */
  async imagem(campanhaId: number, cenaId: number): Promise<string> {
    const blob = await firstValueFrom(this.http.get(`${this.base(campanhaId)}/${cenaId}/imagem`, { responseType: 'blob' }));
    return URL.createObjectURL(blob);
  }

  neblina(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<NeblinaDoServidor>(`${this.base(campanhaId)}/${cenaId}/neblina`));
  }

  ajustarNeblina(campanhaId: number, cenaId: number, ajuste: { ativa: boolean; tudo?: "revelar" | "cobrir" }) {
    return firstValueFrom(this.http.put<NeblinaDoServidor>(`${this.base(campanhaId)}/${cenaId}/neblina`, ajuste));
  }

  tokens(campanhaId: number, cenaId: number) {
    return firstValueFrom(this.http.get<TokenCena[]>(`${this.base(campanhaId)}/${cenaId}/tokens`));
  }

  criarToken(campanhaId: number, cenaId: number, token: TokenForm) {
    return firstValueFrom(this.http.post<TokenCena>(`${this.base(campanhaId)}/${cenaId}/tokens`, token));
  }

  editarToken(campanhaId: number, cenaId: number, tokenId: number, token: TokenForm) {
    return firstValueFrom(this.http.put<TokenCena>(`${this.base(campanhaId)}/${cenaId}/tokens/${tokenId}`, token));
  }

  excluirToken(campanhaId: number, cenaId: number, tokenId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base(campanhaId)}/${cenaId}/tokens/${tokenId}`));
  }

  /** Põe no mapa os combatentes do combate ativo da sessão (a campanha pode ter um combate por sessão). */
  tokensDoCombate(campanhaId: number, cenaId: number, sessaoId: number) {
    return firstValueFrom(this.http.post<TokenCena[]>(`${this.base(campanhaId)}/${cenaId}/tokens/do-combate?sessaoId=${sessaoId}`, {}));
  }

  // ---------- tempo real ----------

  /** Entra no mapa da campanha. Devolve a função que sai dele e solta os ouvintes. */
  async conectar(campanhaId: number, ouvintes: OuvintesDoMapa): Promise<() => Promise<void>> {
    await this.desconectar();
    this.campanhaId = campanhaId;

    const conexao = new signalR.HubConnectionBuilder()
      // O WebSocket não envia o header Authorization: o token vai na query (?access_token=)
      .withUrl(environment.apiUrl.replace(/\/api$/, '') + '/cenahub', { accessTokenFactory: () => localStorage.getItem('token') ?? '' })
      .withAutomaticReconnect()
      .build();
    this.conexao = conexao;

    conexao.on('CenaAtualizada', () => ouvintes.cenaAtualizada?.());
    conexao.on('TokenAtualizado', (t: TokenCena) => ouvintes.tokenAtualizado?.(t));
    conexao.on('TokenMovido', (m: MovimentoToken) => ouvintes.tokenMovido?.(m));
    conexao.on('NeblinaAlterada', n => ouvintes.neblinaAlterada?.(n));
    conexao.on('NeblinaAtualizada', n => ouvintes.neblinaAtualizada?.(n));
    conexao.on('ParedesAtualizadas', (r: { cenaId: number }) => ouvintes.paredesAtualizadas?.(r));
    conexao.on('MarcadorAtualizado', (m: Marcador) => ouvintes.marcadorAtualizado?.(m));
    conexao.on('MarcadorRemovido', (r: { marcadorId: number; cenaId: number }) => ouvintes.marcadorRemovido?.(r));
    conexao.on('TracoCriado', (t: Traco) => ouvintes.tracoCriado?.(t));
    conexao.on('TracoRemovido', (r: { tracoId: number; cenaId: number }) => ouvintes.tracoRemovido?.(r));
    conexao.on('TracosLimpos', (r: { cenaId: number }) => ouvintes.tracosLimpos?.(r));
    conexao.on('ReguaCompartilhada', (r: ReguaDeOutro) => ouvintes.reguaCompartilhada?.(r));
    conexao.on('Ping', (p: PingDoMapa) => ouvintes.ping?.(p));
    conexao.on('TokenRemovido', (r: { tokenId: number; cenaId: number }) => ouvintes.tokenRemovido?.(r));
    conexao.onreconnected(async () => {
      await conexao.invoke('EntrarNaCena', campanhaId).catch(() => undefined);
      ouvintes.reconectou?.();
    });

    await conexao.start();
    await conexao.invoke('EntrarNaCena', campanhaId);
    return () => this.desconectar();
  }

  async desconectar(): Promise<void> {
    const conexao = this.conexao;
    this.conexao = undefined;
    this.campanhaId = undefined;
    if (conexao) await conexao.stop().catch(() => undefined);
  }

  async alterarNeblina(cenaId: number, coluna: number, linha: number, largura: number, altura: number, revelar: boolean): Promise<void> {
    await this.invocar('AlterarNeblina', cenaId, coluna, linha, largura, altura, revelar);
  }

  /** Mostra a minha régua aos outros (ativa = false apaga). Nada é gravado. */
  async regua(cenaId: number, c1: number, l1: number, c2: number, l2: number, ativa: boolean): Promise<void> {
    await this.invocar('Regua', cenaId, c1, l1, c2, l2, ativa);
  }

  async ping(cenaId: number, x: number, y: number): Promise<void> {
    await this.invocar('Ping', cenaId, x, y);
  }

  private async invocar(metodo: string, ...argumentos: unknown[]): Promise<void> {
    if (!this.conexao || this.campanhaId === undefined || this.conexao.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Sem conexão com a mesa. Tente de novo em instantes.');
    }
    await this.conexao.invoke(metodo, this.campanhaId, ...argumentos);
  }

  /** Pede ao servidor para mover o token. Recusas (sem permissão, token escondido) viram erro. */
  async mover(tokenId: number, coluna: number, linha: number): Promise<void> {
    if (!this.conexao || this.campanhaId === undefined || this.conexao.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Sem conexão com a mesa. Tente de novo em instantes.');
    }
    await this.conexao.invoke('MoverToken', this.campanhaId, tokenId, coluna, linha);
  }
}
