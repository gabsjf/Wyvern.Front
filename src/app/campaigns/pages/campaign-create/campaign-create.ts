import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';

@Component({
  selector: 'app-campaign-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './campaign-create.html',
  styleUrl: './campaign-create.scss',
})
export class CampaignCreate {
  private campaignService = inject(CampaignService);
  private router = inject(Router);

  campaign: Campaign = {
    campanhaId: 0,
    nome: '',
    sistema: '',
    mestreId: 1, // mocked for now until Auth is done
    ativo: true,
    criadoEm: new Date().toISOString()
  };

  save(): void {
    this.campaignService.create(this.campaign).subscribe({
      next: () => {
        this.router.navigate(['/campaigns']);
      },
      error: (err) => {
        console.error('Erro ao criar campanha', err);
      }
    });
  }
}
