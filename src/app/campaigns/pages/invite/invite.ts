import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CampaignService } from '../../services/campaign';
import { TrazerHeroi } from '../../../personagens/components/trazer-heroi/trazer-heroi';
import { Personagem } from '../../../personagens/models/personagem';

/**
 * Destino do link de convite: entra na campanha e, em seguida, oferece trazer um herói que a pessoa já tem
 * (uma cópia, de outra campanha) ou criar um novo.
 */
@Component({
  selector: 'app-invite',
  imports: [RouterLink, TrazerHeroi],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
})
export class InviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignService = inject(CampaignService);

  readonly status = signal<'loading' | 'success' | 'error'>('loading');
  readonly message = signal('Entrando na campanha...');
  readonly campanhaId = signal<number | null>(null);
  readonly campanhaNome = signal('');
  /** Herói trazido nesta visita: troca o convite pelo atalho para a ficha. */
  readonly trazido = signal<Personagem | null>(null);

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.fail('Este link de convite está incompleto. Peça ao Mestre um novo link.');
      return;
    }

    this.campaignService.join(token).subscribe({
      next: ({ campanhaId }) => {
        this.campanhaId.set(campanhaId);
        this.status.set('success');
        this.campaignService.getById(campanhaId).subscribe({ next: c => this.campanhaNome.set(c.nome) });
      },
      error: (err: HttpErrorResponse) => {
        console.error(err);
        this.fail(this.messageFor(err));
      },
    });
  }

  aoTrazer(p: Personagem) {
    this.trazido.set(p);
  }

  irParaCampanha() {
    void this.router.navigate(['/campaigns', this.campanhaId()]);
  }

  private fail(message: string) {
    this.status.set('error');
    this.message.set(message);
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
