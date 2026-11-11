import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardSummary, SessaoNoPainel } from '../../models/dashboard-summary';
import { Emblema } from '../../../shared/ui/emblema/emblema';
import { AuthService } from '../../services/auth.service';

/**
 * O painel inicial. Tudo vem de uma chamada só (/Dashboard/resumo), já contado e cortado no servidor:
 * nada de baixar as listas inteiras de campanhas, sessões e personagens para montar o resumo.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, Emblema],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  /** Só mostra "Nova campanha" para quem pode criar (conta Mestre com vaga, ou qualquer conta no beta). */
  readonly usuario = inject(AuthService).usuarioLogado;

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(true);
  readonly erro = signal(false);
  readonly hoje = new Date();

  /** A campanha mais recente, para "Continue de onde parou". */
  readonly destaque = computed(() => this.summary()?.destaque ?? null);
  readonly ultimaSessao = computed(() => this.summary()?.ultimaSessaoDoDestaque ?? null);
  readonly campanhas = computed(() => this.summary()?.ultimasCampanhas ?? []);
  readonly herois = computed(() => this.summary()?.herois ?? []);

  /** Sessões agendadas; se não houver, as mais recentes, para o bloco nunca ficar vazio à toa. */
  readonly listaSessoes = computed<{ titulo: string; itens: SessaoNoPainel[] }>(() => {
    const s = this.summary();
    const futuras = s?.proximasSessoes ?? [];
    return futuras.length
      ? { titulo: 'Próximas sessões', itens: futuras }
      : { titulo: 'Sessões recentes', itens: s?.sessoesRecentes ?? [] };
  });

  /** Há mais campanhas do que as que cabem no painel? Então o "Ver todas" mostra quantas são. */
  readonly campanhasAlemDoPainel = computed(() => {
    const s = this.summary();
    return s ? Math.max(0, s.totalCampanhas - s.ultimasCampanhas.length) : 0;
  });

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.erro.set(false);
    this.dashboardService.getResumo().subscribe({
      next: res => {
        this.summary.set(res);
        this.loading.set(false);
      },
      error: err => {
        console.error('Erro ao carregar o dashboard', err);
        this.erro.set(true);
        this.loading.set(false);
      },
    });
  }
}
