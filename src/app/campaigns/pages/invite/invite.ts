import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignService } from '../../services/campaign';

@Component({
  selector: 'app-invite',
  imports: [CommonModule],
  templateUrl: './invite.html'
})
export class InviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignService = inject(CampaignService);

  status: 'loading' | 'success' | 'error' = 'loading';
  message: string = 'Iniciando o ritual de invocação...';

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.status = 'error';
      this.message = 'Selo de invocação (Token) inválido ou ausente.';
      return;
    }

    this.campaignService.join(token).subscribe({
      next: (res) => {
        this.status = 'success';
        this.message = 'Ritual concluído! Você agora faz parte desta campanha.';
        setTimeout(() => {
          this.router.navigate(['/campaigns']);
        }, 2000);
      },
      error: (err) => {
        console.error(err);
        this.status = 'error';
        this.message = 'A magia falhou. Talvez o selo de invocação esteja expirado ou você já faça parte desta campanha.';
      }
    });
  }
}
