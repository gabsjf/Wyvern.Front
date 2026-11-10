import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardSummary } from '../../models/dashboard-summary';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { Personagem } from '../../../personagens/models/personagem';
import { SessaoService } from '../../../sessoes/services/sessao.service';
import { Sessao } from '../../../sessoes/models/sessao';
import { Emblema } from '../../../shared/ui/emblema/emblema';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, Emblema],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private campaignService = inject(CampaignService);
  private personagemService = inject(PersonagemService);
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  /** Só mostra "Nova campanha" para quem pode criar (conta Mestre com vaga, ou qualquer conta no beta). */
  readonly usuario = inject(AuthService).usuarioLogado;

  summary: DashboardSummary | null = null;
  loading: boolean = true;

  campanhas: Campaign[] = [];
  herois: Personagem[] = [];
  sessoes: Sessao[] = [];
  hoje = new Date();

  /** A campanha em destaque é a mais recente (a API devolve a lista na ordem de criação). */
  get destaque(): Campaign | null {
    return this.campanhas.length ? this.campanhas[this.campanhas.length - 1] : null;
  }

  /** Última sessão registrada da campanha em destaque. */
  get ultimaSessao(): Sessao | null {
    const id = this.destaque?.campanhaId;
    const dela = this.sessoes.filter(s => s.campanhaId === id).sort((a, b) => b.numeroSessao - a.numeroSessao);
    return dela[0] ?? null;
  }

  /** Sessões agendadas; se não houver, mostra as mais recentes para o bloco nunca ficar vazio à toa. */
  get listaSessoes(): { titulo: string; itens: Sessao[] } {
    const futuras = this.summary?.proximasSessoes ?? [];
    if (futuras.length) return { titulo: 'Próximas sessões', itens: futuras };
    const recentes = [...this.sessoes].sort((a, b) => +new Date(b.dataSessao) - +new Date(a.dataSessao)).slice(0, 5);
    return { titulo: 'Sessões recentes', itens: recentes };
  }

  nomeDaCampanha(id: number): string {
    return this.campanhas.find(c => c.campanhaId === id)?.nome ?? 'Campanha';
  }

  ngOnInit() {
    this.dashboardService.getResumo().subscribe({
      next: (res) => {
        this.summary = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erro ao carregar o dashboard', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    // O resto enriquece o painel; se falhar, ele continua útil só com o resumo
    this.campaignService.getAll().subscribe({ next: c => { this.campanhas = c; this.cdr.detectChanges(); } });
    this.personagemService.getAll().subscribe({ next: p => { this.herois = p.filter(x => x.tipoId === 1); this.cdr.detectChanges(); } });
    this.sessaoService.getAll().subscribe({ next: s => { this.sessoes = s; this.cdr.detectChanges(); } });
  }
}
