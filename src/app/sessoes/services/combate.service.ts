import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments';
import * as signalR from '@microsoft/signalr';
import { AuthService } from '../../core/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class CombateService {
  private apiUrl = `${environment.apiUrl}/combate`;
  private hubConnection: signalR.HubConnection | undefined;
  private iniciando: Promise<void> | undefined;

  private auth = inject(AuthService);

  constructor(private http: HttpClient) {}

  private async ensureConnection(): Promise<void> {
    const hubUrl = environment.apiUrl.replace(/\/api$/, '') + '/combathub';
    if (!this.hubConnection) {
      this.hubConnection = new signalR.HubConnectionBuilder()
        // O hub exige login: na web vale o cookie da sessão (withCredentials), sem token na URL
        .withUrl(hubUrl, this.auth.opcoesDoHub())
        .withAutomaticReconnect()
        .build();
    }

    // Dois componentes podem pedir a conexão ao mesmo tempo: todos esperam a mesma promessa de início,
    // senão o segundo tenta enviar enquanto a conexão ainda está abrindo.
    if (this.hubConnection.state === signalR.HubConnectionState.Disconnected && !this.iniciando) {
      this.iniciando = this.hubConnection.start().finally(() => (this.iniciando = undefined));
    }
    if (this.iniciando) {
      await this.iniciando;
    }
  }

  public async startConnection(combateId: number, onUpdate: () => void) {
    try {
      await this.ensureConnection();
      await this.hubConnection!.invoke('JoinCombatGroup', combateId.toString());
      
      this.hubConnection!.off('ReceiveCombatUpdate');
      this.hubConnection!.on('ReceiveCombatUpdate', () => {
        onUpdate();
      });
    } catch (err) {
      console.error('Error starting combat connection: ', err);
    }
  }

  public stopConnection(combateId: number) {
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('LeaveCombatGroup', combateId.toString()).catch(err => console.error(err));
    }
  }

  public async startSessaoConnection(sessaoId: number, onUpdate: () => void) {
    try {
      await this.ensureConnection();
      await this.hubConnection!.invoke('JoinSessaoGroup', sessaoId.toString());

      this.hubConnection!.off('ReceiveCombatUpdate');
      this.hubConnection!.on('ReceiveCombatUpdate', () => {
        onUpdate();
      });
    } catch (err) {
      console.error('Error starting sessao connection: ', err);
    }
  }

  public stopSessaoConnection(sessaoId: number) {
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('LeaveSessaoGroup', sessaoId.toString()).catch(err => console.error(err));
    }
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
