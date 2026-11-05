import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environments';
import { DiceService, ResultadoDados } from '../../core/services/dice.service';
import { AuthService } from '../../core/services/auth.service';

export interface RolagemMesa {
  id: string;
  usuarioId: number;
  usuario: string;
  personagem?: string | null;
  rotulo: string;
  formula: string;
  total: number;
  dados: number[];
  quando: string;
}

const LIMITE_NA_TELA = 40;

/**
 * A mesa ao vivo de uma campanha: tudo o que se rola (na ficha, no combate...) aparece em tempo real para
 * os outros participantes. Quem entra vê também as últimas rolagens.
 */
@Injectable({ providedIn: 'root' })
export class MesaService {
  private dados = inject(DiceService);
  private auth = inject(AuthService);

  /** Da mais antiga para a mais recente. */
  readonly rolagens = signal<RolagemMesa[]>([]);
  readonly conectada = signal(false);

  private conexao: signalR.HubConnection | undefined;
  private campanhaId: number | undefined;
  private entrando: Promise<void> | undefined;

  /** Entra na mesa da campanha (e sai da anterior, se for outra). Falhas de conexão não impedem de rolar. */
  async entrar(campanhaId: number): Promise<void> {
    if (this.campanhaId === campanhaId && this.conectada()) return;
    if (this.campanhaId !== undefined && this.campanhaId !== campanhaId) await this.sair();

    this.campanhaId = campanhaId;
    this.entrando ??= this.conectar(campanhaId).finally(() => (this.entrando = undefined));
    await this.entrando;
  }

  async sair(): Promise<void> {
    const anterior = this.campanhaId;
    this.campanhaId = undefined;
    this.conectada.set(false);
    this.rolagens.set([]);
    if (anterior !== undefined && this.conexao?.state === signalR.HubConnectionState.Connected) {
      await this.conexao.invoke('SairDaMesa', anterior).catch(() => undefined);
    }
  }

  /** Rola os dados e, se estiver numa mesa, publica o resultado para os outros. */
  async rolar(rotulo: string, formula: string, personagem?: string | null): Promise<ResultadoDados> {
    const resultado = await this.dados.rolar(formula);

    if (this.conectada() && this.campanhaId !== undefined && this.conexao) {
      this.conexao
        .invoke('Rolar', this.campanhaId, { rotulo, formula: resultado.formula, personagem, total: resultado.total, dados: resultado.dados })
        .catch(erro => console.warn('Não foi possível publicar a rolagem na mesa.', erro));
    }
    return resultado;
  }

  private async conectar(campanhaId: number): Promise<void> {
    try {
      if (!this.conexao) {
        const url = environment.apiUrl.replace(/\/api$/, '') + '/mesahub';
        this.conexao = new signalR.HubConnectionBuilder()
          .withUrl(url, this.auth.opcoesDoHub())
          .withAutomaticReconnect()
          .build();

        this.conexao.on('ReceberRolagem', (r: RolagemMesa) =>
          this.rolagens.update(lista => [...lista, r].slice(-LIMITE_NA_TELA)));
        // depois de uma queda, volta para a mesma mesa
        this.conexao.onreconnected(() => {
          if (this.campanhaId !== undefined) void this.entrarNoGrupo(this.campanhaId);
        });
        this.conexao.onclose(() => this.conectada.set(false));
      }

      if (this.conexao.state === signalR.HubConnectionState.Disconnected) {
        await this.auth.garantirSessaoParaHub();
        await this.conexao.start();
      }
      await this.entrarNoGrupo(campanhaId);
    } catch (erro) {
      console.warn('Mesa ao vivo indisponível; as rolagens continuam funcionando só para você.', erro);
      this.conectada.set(false);
    }
  }

  private async entrarNoGrupo(campanhaId: number): Promise<void> {
    const historico = await this.conexao!.invoke<RolagemMesa[]>('EntrarNaMesa', campanhaId);
    this.rolagens.set(historico.slice(-LIMITE_NA_TELA));
    this.conectada.set(true);
  }
}
