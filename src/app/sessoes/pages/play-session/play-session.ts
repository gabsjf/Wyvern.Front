import { Component, DestroyRef, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CombateTracker } from '../combate-tracker/combate-tracker';
import { Anotacoes } from './anotacoes/anotacoes';
import { MapaTatico } from '../mapa-tatico/mapa-tatico';
import { LayoutService } from '../../../core/layout/layout.service';
import { MesaAoVivo } from '../../../campaigns/components/mesa-ao-vivo/mesa-ao-vivo';

@Component({
  selector: 'app-play-session',
  imports: [CommonModule, RouterLink, CombateTracker, Anotacoes, MapaTatico, MesaAoVivo],
  templateUrl: './play-session.html',
  styleUrl: './play-session.scss'
})
export class PlaySession implements OnInit {
  private route = inject(ActivatedRoute);
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  private layout = inject(LayoutService);

  sessaoId!: number;
  sessao: Sessao | null = null;
  activeTab: 'combate' | 'mapa' | 'anotacoes' = 'combate';

  constructor() {
    // A mesa ocupa a tela toda: some a barra do app enquanto ela estiver aberta
    this.layout.imersivo.set(true);
    inject(DestroyRef).onDestroy(() => this.layout.imersivo.set(false));
  }

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

  setTab(tab: 'combate' | 'mapa' | 'anotacoes') {
    this.activeTab = tab;
  }
}
