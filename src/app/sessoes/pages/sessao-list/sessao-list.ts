import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { PapelService } from '../../../campaigns/services/papel.service';

@Component({
  selector: 'app-sessao-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './sessao-list.html',
  styleUrl: './sessao-list.scss',
})
export class SessaoList implements OnInit {
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  private papelService = inject(PapelService);
  sessoes: Sessao[] = [];
  // Só quem é Mestre de alguma campanha pode criar sessões (o servidor valida por campanha)
  podeCriarSessao = false;

  ngOnInit() {
    this.loadSessoes();
    this.papelService.ehMestreEmAlguma().subscribe({
      next: (ehMestre) => {
        this.podeCriarSessao = ehMestre;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
  }

  /** Sessões agrupadas por campanha, a mais recente primeiro dentro de cada uma. */
  get porCampanha(): { campanhaId: number; nome: string; sessoes: Sessao[] }[] {
    const mapa = new Map<number, Sessao[]>();
    for (const s of this.sessoes) mapa.set(s.campanhaId, [...(mapa.get(s.campanhaId) ?? []), s]);
    return [...mapa.entries()].map(([campanhaId, sessoes]) => ({
      campanhaId,
      nome: sessoes[0].campanha?.nome || 'Campanha',
      sessoes: sessoes.sort((a, b) => b.numeroSessao - a.numeroSessao),
    }));
  }

  /** Agendada para o futuro? (as demais já aconteceram ou estão sem data marcada) */
  agendada(s: Sessao): boolean {
    return !!s.dataAgendada && +new Date(s.dataAgendada) > Date.now();
  }

  loadSessoes() {
    this.sessaoService.getAll().subscribe({
      next: (data) => {
        this.sessoes = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erro ao buscar sessões', err);
      }
    });
  }
}
