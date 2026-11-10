import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-campaign-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './campaign-create.html',
  styleUrl: './campaign-create.scss',
})
export class CampaignCreate {
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private auth = inject(AuthService);

  isSaving = false;
  readonly erro = signal('');
  /** 403: conta Jogador ou limite do plano; mostra o link para o perfil. */
  readonly bloqueadoPeloPlano = signal(false);

  campaign: Campaign = {
    campanhaId: 0,
    nome: '',
    sistema: '',
    mestreId: 1, // mocked for now until Auth is done
    ativo: true,
    criadoEm: new Date().toISOString()
  };

  save(): void {
    if (this.isSaving) return;
    this.isSaving = true;
    this.erro.set('');
    this.campaignService.create(this.campaign).subscribe({
      next: () => {
        this.isSaving = false;
        void this.auth.carregarSessao(); // o limite do plano pode ter sido atingido agora
        this.router.navigate(['/campaigns']);
      },
      error: (err: HttpErrorResponse) => {
        this.isSaving = false;
        this.bloqueadoPeloPlano.set(err.status === 403);
        // a API explica o motivo (ProblemDetails.detail)
        this.erro.set(err.error?.detail || err.error?.message || 'Não foi possível criar a campanha. Tente de novo.');
      }
    });
  }
}
