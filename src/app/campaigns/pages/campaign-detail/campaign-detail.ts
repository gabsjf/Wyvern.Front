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
  inviteMessage = '';
  inviteBusy = false;

  // O link sempre aponta para o domínio de produção, mesmo quando o Mestre está em localhost.
  private buildInviteUrl(token: string) {
    return `https://wyvern-kappa.vercel.app/invite/${token}`;
  }

  private showInviteMessage(message: string) {
    this.inviteMessage = message;
    this.cdr.detectChanges();
  }

  // Mostra o link atual (cria um se ainda não existir); clicar de novo não muda o link.
  generateInvite(renovar = false) {
    if (!this.campaign?.campanhaId || this.inviteBusy) return;

    this.inviteBusy = true;
    this.campaignService.generateInvite(this.campaign.campanhaId, renovar).subscribe({
      next: (res) => {
        this.inviteBusy = false;
        this.inviteUrl = this.buildInviteUrl(res.token);
        this.showInviteMessage(renovar ? 'Novo link gerado. O link anterior deixou de funcionar.' : '');
      },
      error: (err) => {
        console.error(err);
        this.inviteBusy = false;
        this.showInviteMessage('Não foi possível gerar o convite. Tente novamente.');
      }
    });
  }

  renewInvite() {
    if (confirm('Gerar um novo link? O link anterior deixará de funcionar para quem ainda não entrou.')) {
      this.generateInvite(true);
    }
  }

  revokeInvite() {
    if (!this.campaign?.campanhaId || this.inviteBusy) return;
    if (!confirm('Desativar o link de convite? Ninguém mais conseguirá entrar por ele.')) return;

    this.inviteBusy = true;
    this.campaignService.revokeInvite(this.campaign.campanhaId).subscribe({
      next: () => {
        this.inviteBusy = false;
        this.inviteUrl = null;
        this.showInviteMessage('Link de convite desativado.');
      },
      error: (err) => {
        console.error(err);
        this.inviteBusy = false;
        this.showInviteMessage('Não foi possível desativar o convite.');
      }
    });
  }

  async copyInvite() {
    if (!this.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.showInviteMessage('Link copiado!');
    } catch {
      this.showInviteMessage('Não foi possível copiar automaticamente. Selecione o link e copie.');
    }
  }
}
