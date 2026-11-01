import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';import { CommonModule } from '@angular/common';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-campaign-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './campaign-list.html',
  styleUrl: './campaign-list.scss',
})
export class CampaignList implements OnInit {
  private campaignService = inject(CampaignService);
   private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  campaigns: Campaign[] = [];

  get userRole(): string {
    return this.authService.userRole || 'Jogador';
  }

  ngOnInit(): void {
  this.loadCampaigns();
}

private loadCampaigns(): void {
  this.campaignService.getAll().subscribe({
    next: (response: Campaign[]) => {
      this.campaigns = [...response];
      this.cdr.detectChanges();
    },
    error: (error: unknown) => {
      console.error('Erro ao buscar campanhas:', error);
    },
  });
}

}
