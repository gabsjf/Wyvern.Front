import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { Emblema } from '../../../shared/ui/emblema/emblema';

/** Data local no formato do <input type="date"> (aaaa-mm-dd). */
export function diaLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Lê aaaa-mm-dd como meia-noite local (new Date('aaaa-mm-dd') seria UTC e pode cair no dia anterior). */
function lerDia(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function somarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Próximo sábado a partir de hoje (se hoje é sábado, o da semana que vem). */
export function proximoSabado(hoje: Date): Date {
  return somarDias(hoje, ((6 - hoje.getDay() + 7) % 7) || 7);
}

@Component({
  selector: 'app-sessao-create',
  imports: [FormsModule, RouterModule, Emblema],
  templateUrl: './sessao-create.html',
  styleUrl: './sessao-create.scss',
})
export class SessaoCreate implements OnInit {
  private sessaoService = inject(SessaoService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  protected route = inject(ActivatedRoute);

  readonly hoje = diaLocal(new Date());

  readonly carregando = signal(true);
  /** Só as campanhas em que o usuário é Mestre: só ele cria sessões. */
  readonly campanhas = signal<Campaign[]>([]);
  private readonly todasSessoes = signal<Sessao[]>([]);

  readonly editando = signal(false);
  private sessaoId?: number;

  readonly campanhaId = signal(0);
  readonly numero = signal(1);
  /** Depois que o Mestre mexe no número, trocar de campanha não o recalcula mais. */
  private numeroManual = false;
  readonly nome = signal('');
  readonly data = signal(this.hoje);
  readonly obs = signal('');

  readonly salvando = signal(false);
  readonly erro = signal('');

  readonly campanha = computed(() => this.campanhas().find(c => c.campanhaId === this.campanhaId()));

  /** Sessões já registradas na campanha escolhida, a mais recente primeiro. */
  readonly sessoesDaCampanha = computed(() =>
    this.todasSessoes()
      .filter(s => s.campanhaId === this.campanhaId() && s.sessaoId !== this.sessaoId)
      .sort((a, b) => b.numeroSessao - a.numeroSessao),
  );
  readonly ultima = computed(() => this.sessoesDaCampanha()[0]);

  readonly agendada = computed(() => !!this.data() && this.data() > this.hoje);

  readonly atalhos = computed(() => {
    const hoje = new Date();
    return [
      { rotulo: 'Hoje', dia: this.hoje },
      { rotulo: 'Próximo sábado', dia: diaLocal(proximoSabado(hoje)) },
      { rotulo: 'Daqui a 1 semana', dia: diaLocal(somarDias(hoje, 7)) },
    ];
  });

  /** Frase sob a data: quando é e se vira sessão agendada ou registro de algo já jogado. */
  readonly sobreData = computed(() => {
    if (!this.data()) return '';
    const extenso = lerDia(this.data()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const dias = Math.round((+lerDia(this.data()) - +lerDia(this.hoje)) / 86_400_000);
    if (dias === 0) return `Hoje, ${extenso}.`;
    if (dias > 0) return `Agendada para ${extenso}, ${dias === 1 ? 'amanhã' : `daqui a ${dias} dias`}.`;
    return `Registro de sessão já jogada: ${extenso}.`;
  });

  readonly dataCurta = computed(() => (this.data() ? lerDia(this.data()).toLocaleDateString('pt-BR') : ''));
  readonly nomePrevia = computed(() => this.nome().trim() || 'Título da sessão');

  readonly podeSalvar = computed(
    () => !!this.campanhaId() && !!this.nome().trim() && !!this.data() && this.numero() >= 1 && !this.salvando(),
  );

  readonly falta = computed(() => {
    const itens = [!this.campanhaId() && 'a campanha', !this.nome().trim() && 'o título', !this.data() && 'a data'].filter(Boolean);
    if (!itens.length) return '';
    return 'Falta ' + (itens.length === 1 ? itens[0] : itens.slice(0, -1).join(', ') + ' e ' + itens.at(-1)) + '.';
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const daCampanha = Number(this.route.snapshot.queryParamMap.get('campanha'));

    this.campaignService.getAll().subscribe({
      next: lista => {
        const minhas = lista.filter(c => c.papel === 'Mestre');
        this.campanhas.set(minhas);
        this.carregando.set(false);
        if (id) return;
        // Veio de uma campanha (ou só há uma): já deixa escolhida
        const inicial = minhas.find(c => c.campanhaId === daCampanha) ?? (minhas.length === 1 ? minhas[0] : undefined);
        if (inicial) this.escolherCampanha(inicial.campanhaId!);
      },
      error: () => {
        this.carregando.set(false);
        this.erro.set('Não foi possível carregar as suas campanhas. Recarregue a página.');
      },
    });

    this.sessaoService.getAll().subscribe({
      next: lista => {
        this.todasSessoes.set(lista);
        if (!id) this.recalcularNumero();
      },
    });

    if (id) {
      this.editando.set(true);
      this.sessaoId = id;
      this.numeroManual = true;
      this.sessaoService.getById(id).subscribe({
        next: s => {
          this.campanhaId.set(s.campanhaId);
          this.numero.set(s.numeroSessao);
          this.nome.set(s.nome ?? '');
          this.data.set(s.dataSessao ? s.dataSessao.slice(0, 10) : this.hoje);
          this.obs.set(s.obs ?? '');
        },
        error: () => this.erro.set('Não foi possível carregar esta sessão.'),
      });
    }
  }

  escolherCampanha(id: number): void {
    if (this.editando()) return;
    this.campanhaId.set(id);
    this.recalcularNumero();
  }

  mudarNumero(valor: number): void {
    this.numeroManual = true;
    this.numero.set(Math.max(1, Math.floor(Number(valor) || 1)));
  }

  private recalcularNumero(): void {
    if (this.numeroManual || !this.campanhaId()) return;
    this.numero.set((this.ultima()?.numeroSessao ?? 0) + 1);
  }

  save(): void {
    if (!this.podeSalvar()) return;
    this.salvando.set(true);
    this.erro.set('');

    const sessao: Sessao = {
      numeroSessao: this.numero(),
      nome: this.nome().trim(),
      dataSessao: this.data(),
      // Data no futuro = sessão agendada; no passado ou hoje é o registro de uma já jogada
      dataAgendada: this.agendada() ? this.data() : undefined,
      obs: this.obs().trim(),
      campanhaId: this.campanhaId(),
    };

    const pedido = this.editando() && this.sessaoId
      ? this.sessaoService.update(this.sessaoId, { ...sessao, sessaoId: this.sessaoId })
      : this.sessaoService.create(sessao);

    pedido.subscribe({
      next: salva => {
        this.salvando.set(false);
        const id = this.sessaoId ?? salva?.sessaoId;
        this.router.navigate(id ? ['/sessoes', id] : ['/sessoes']);
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.erro.set(err.error?.detail || err.error?.message || 'Não foi possível salvar a sessão. Tente de novo.');
      },
    });
  }
}
