import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CampaignService } from '../../services/campaign';

@Component({
  selector: 'app-invite',
  imports: [CommonModule, RouterLink],
  templateUrl: './invite.html'
})
export class InviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignService = inject(CampaignService);
  private cdr = inject(ChangeDetectorRef);

  status: 'loading' | 'success' | 'error' = 'loading';
  message: string = 'Iniciando o ritual de invocação...';

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.fail('Selo de invocação (Token) inválido ou ausente.');
      return;
    }

    this.campaignService.join(token).subscribe({
      next: () => {
        this.status = 'success';
        this.message = 'Ritual concluído! Você agora faz parte desta campanha.';
        this.cdr.detectChanges();
        setTimeout(() => this.router.navigate(['/campaigns']), 2000);
      },
      error: (err: HttpErrorResponse) => {
        console.error(err);
        this.fail(this.messageFor(err));
      }
    });
  }

  private fail(message: string) {
    this.status = 'error';
    this.message = message;
    this.cdr.detectChanges();
  }

  // Cada causa tem uma mensagem própria, em vez de um texto genérico para qualquer erro.
  private messageFor(err: HttpErrorResponse): string {
    switch (err.status) {
      case 0:
        return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
      case 404:
        return 'Este convite não é mais válido. Peça ao Mestre um novo link.';
      case 400:
        // campanha cheia (limite do plano do Mestre) ou "você já é Mestre": a API explica no ProblemDetails
        if (typeof err.error === 'string' && err.error) return err.error;
        return err.error?.detail || err.error?.message || 'Não foi possível usar este convite.';
      case 429:
        return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
      default:
        return 'Algo deu errado ao entrar na campanha. Tente novamente em instantes.';
    }
  }
}
