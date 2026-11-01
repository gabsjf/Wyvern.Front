import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-campaign-detail',
  imports: [CommonModule, RouterModule],
  templateUrl: './campaign-detail.html',
  styleUrl: './campaign-detail.scss',
})
export class CampaignDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignService = inject(CampaignService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  campaign: Campaign | null = null;
  isLoading = true;

  get userRole(): string {
    return this.authService.userRole || 'Jogador';
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.campaignService.getById(id).subscribe({
        next: (data) => {
          this.campaign = data;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Erro ao buscar campanha', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  showDeleteModal = false;

  deleteCampaign() {
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
  }

  confirmDelete() {
    if (this.campaign?.campanhaId) {
      this.campaignService.delete(this.campaign.campanhaId).subscribe({
        next: () => {
          this.router.navigate(['/campaigns']);
        },
        error: (err) => {
          console.error('Erro ao deletar campanha', err);
          this.showDeleteModal = false;
        }
      });
    }
  }

  inviteUrl: string | null = null;
  generateInvite() {
    if (this.campaign?.campanhaId) {
      this.campaignService.generateInvite(this.campaign.campanhaId).subscribe({
        next: (res) => {
          this.inviteUrl = `https://wyvern-kappa.vercel.app/invite/${res.token}`;
          this.cdr.detectChanges();
        },
        error: (err) => console.error(err)
      });
    }
  }
}
