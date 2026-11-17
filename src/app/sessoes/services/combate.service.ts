import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments';
import * as signalR from '@microsoft/signalr';
import { AuthService } from '../../core/services/auth.service';

export interface OuvinteDaSessao {
  /** O combate mudou a ficha deste personagem. */
  personagem?: (personagemId: number) => void;
  /** A vez passou para outro combatente (ou o combate começou ou acabou). */
  vez?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class CombateService {
  private apiUrl = `${environment.apiUrl}/combate`;
  private hubConnection: signalR.HubConnection | undefined;
  private iniciando: Promise<void> | undefined;

  private auth = inject(AuthService);

  /** Quem recarrega o combate a cada mudança (o rastreador ou o mapa: um por vez, o último que pediu). */
  private aoAtualizarCombate: (() => void) | null = null;
  /** Quem acompanha a sessão de fora do rastreador (a ficha rápida e o aviso de "Sua vez"). */
  private observadoresDaSessao = new Set<OuvinteDaSessao>();
  /**
   * Grupos do hub em que esta conexão está, com quantos componentes pediram cada um: a conexão é uma só para o app,
   * então um componente que sai não pode tirar do grupo quem ainda precisa dele.
   */
  private grupos = new Map<string, number>();

  constructor(private http: HttpClient) {}

  private async ensureConnection(): Promise<void> {
    const hubUrl = environment.apiUrl.replace(/\/api$/, '') + '/combathub';
    if (!this.hubConnection) {
      const conexao = new signalR.HubConnectionBuilder()
        // O hub exige login: na web vale o cookie da sessão (withCredentials), sem token na URL
        .withUrl(hubUrl, this.auth.opcoesDoHub())
        .withAutomaticReconnect()
        .build();
      conexao.on('ReceiveCombatUpdate', () => this.aoAtualizarCombate?.());
      conexao.on('PersonagemAtualizado', (personagemId: number) => this.observadoresDaSessao.forEach(o => o.personagem?.(personagemId)));
      conexao.on('VezMudou', () => this.observadoresDaSessao.forEach(o => o.vez?.()));
      // depois de uma queda, o servidor esqueceu os grupos: entra de novo em todos
      conexao.onreconnected(() => {
        for (const grupo of this.grupos.keys()) void this.invocarGrupo('Join', grupo);
      });
      this.hubConnection = conexao;
    }

    // Dois componentes podem pedir a conexão ao mesmo tempo: todos esperam a mesma promessa de início,
    // senão o segundo tenta enviar enquanto a conexão ainda está abrindo.
    if (this.hubConnection.state === signalR.HubConnectionState.Disconnected && !this.iniciando) {
      const conexao = this.hubConnection;
      this.iniciando = (async () => {
        await this.auth.garantirSessaoParaHub();
        await conexao.start();
      })().finally(() => (this.iniciando = undefined));
    }
    if (this.iniciando) {
      await this.iniciando;
    }
  }

  /** "Combate_12" vira JoinCombatGroup("12"); "Sessao_3", JoinSessaoGroup("3"). */
  private invocarGrupo(acao: 'Join' | 'Leave', grupo: string): Promise<void> {
    const [tipo, id] = grupo.split('_');
    const metodo = `${acao}${tipo === 'Combate' ? 'CombatGroup' : 'SessaoGroup'}`;
    return this.hubConnection!.invoke(metodo, id);
  }

  private async entrarNoGrupo(grupo: string): Promise<void> {
    await this.ensureConnection();
    const vezes = this.grupos.get(grupo) ?? 0;
    this.grupos.set(grupo, vezes + 1);
    if (vezes === 0) {
      try {
        await this.invocarGrupo('Join', grupo);
      } catch (erro) {
        this.grupos.delete(grupo);
        throw erro;
      }
    }
  }

  private sairDoGrupo(grupo: string): void {
    const vezes = this.grupos.get(grupo) ?? 0;
    if (vezes > 1) { this.grupos.set(grupo, vezes - 1); return; }
    this.grupos.delete(grupo);
    if (vezes === 1 && this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.invocarGrupo('Leave', grupo).catch(err => console.error(err));
    }
  }

  public async startConnection(combateId: number, onUpdate: () => void) {
    try {
      this.aoAtualizarCombate = onUpdate;
      await this.entrarNoGrupo(`Combate_${combateId}`);
    } catch (err) {
      console.error('Error starting combat connection: ', err);
    }
  }

  public stopConnection(combateId: number) {
    this.sairDoGrupo(`Combate_${combateId}`);
  }

  public async startSessaoConnection(sessaoId: number, onUpdate: () => void) {
    try {
      this.aoAtualizarCombate = onUpdate;
      await this.entrarNoGrupo(`Sessao_${sessaoId}`);
    } catch (err) {
      console.error('Error starting sessao connection: ', err);
    }
  }

  public stopSessaoConnection(sessaoId: number) {
    this.sairDoGrupo(`Sessao_${sessaoId}`);
  }

  /**
   * Avisa quando o combate da sessão muda a ficha de um herói (dano, cura, condições...) e quando a vez passa (inclusive
   * no início e no fim do combate). Devolve a função que para de observar. Falhas de conexão só tiram o aviso ao vivo.
   */
  public async observarSessao(sessaoId: number, ouvinte: OuvinteDaSessao): Promise<() => void> {
    this.observadoresDaSessao.add(ouvinte);
    const grupo = `Sessao_${sessaoId}`;
    let entrou = false;
    try {
      await this.entrarNoGrupo(grupo);
      entrou = true;
    } catch (err) {
      console.warn('Sem aviso ao vivo das mudanças da ficha.', err);
    }
    return () => {
      this.observadoresDaSessao.delete(ouvinte);
      if (entrou) this.sairDoGrupo(grupo);
    };
  }

  getActiveCombat(campanhaId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/active/${campanhaId}`);
  }

  getActiveCombatBySessao(sessaoId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/active/sessao/${sessaoId}`);
  }

  getParticipantes(combateId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${combateId}/participantes`);
  }

  startCombate(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/start`, data);
  }

  endCombate(combateId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${combateId}/end`, {});
  }

  nextTurn(combateId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${combateId}/next-turn`, {});
  }

  updateParticipante(combateId: number, participanteId: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${combateId}/participantes/${participanteId}`, data);
  }
}
