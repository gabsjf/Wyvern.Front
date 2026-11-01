import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CombateTracker } from '../combate-tracker/combate-tracker';
import { Anotacoes } from './anotacoes/anotacoes';

@Component({
  selector: 'app-play-session',
  imports: [CommonModule, CombateTracker, Anotacoes],
  templateUrl: './play-session.html',
  styleUrl: './play-session.scss'
})
export class PlaySession implements OnInit {
  private route = inject(ActivatedRoute);
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);

  sessaoId!: number;
  sessao: Sessao | null = null;
  activeTab: 'combate' | 'anotacoes' = 'combate';

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.sessaoId = +id;
        this.carregarSessao();
      }
    });
  }

  carregarSessao() {
    this.sessaoService.getById(this.sessaoId).subscribe({
      next: (s) => {
        this.sessao = s;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erro ao carregar sessão', err);
        this.cdr.detectChanges();
      }
    });
  }

  setTab(tab: 'combate' | 'anotacoes') {
    this.activeTab = tab;
  }
}
