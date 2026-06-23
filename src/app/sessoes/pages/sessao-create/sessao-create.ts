import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';

@Component({
  selector: 'app-sessao-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './sessao-create.html',
  styleUrl: './sessao-create.scss',
})
export class SessaoCreate implements OnInit {
  private sessaoService = inject(SessaoService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  campanhas: Campaign[] = [];
  isEditMode = false;

  sessao: Sessao = {
    numeroSessao: 1,
    nome: '',
    dataSessao: new Date().toISOString().split('T')[0],
    obs: '',
    campanhaId: 0,
    ativo: true
  };

  ngOnInit() {
    this.campaignService.getAll().subscribe({
      next: (data) => this.campanhas = data,
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.isEditMode = true;
      this.sessaoService.getById(id).subscribe({
        next: (data) => {
          this.sessao = data;
          if (this.sessao.dataSessao) {
            this.sessao.dataSessao = new Date(this.sessao.dataSessao).toISOString().split('T')[0];
          }
        },
        error: (err) => console.error('Erro ao carregar sessão para edição', err)
      });
    }
  }

  save() {
    if (this.isEditMode && this.sessao.sessaoId) {
      this.sessaoService.update(this.sessao.sessaoId, this.sessao).subscribe({
        next: () => this.router.navigate(['/sessoes', this.sessao.sessaoId]),
        error: (err) => console.error('Erro ao atualizar sessão', err)
      });
    } else {
      // Create mode requires converting Date to ISO if needed by backend, but string usually binds fine.
      this.sessaoService.create(this.sessao).subscribe({
        next: () => this.router.navigate(['/sessoes']),
        error: (err) => console.error('Erro ao criar sessão', err)
      });
    }
  }
}
