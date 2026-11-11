import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';
import { RouterModule } from '@angular/router';
import { SessaoService } from '../../../sessoes/services/sessao.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { Emblema, capaDoNome } from '../../../shared/ui/emblema/emblema';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-campaign-list',
  imports: [CommonModule, RouterModule, Emblema],
  templateUrl: './campaign-list.html',
  styleUrl: './campaign-list.scss',
})
export class CampaignList implements OnInit {
  private campaignService = inject(CampaignService);
  private sessaoService = inject(SessaoService);
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  /** Decide entre "Nova campanha", o aviso de conta Jogador e o aviso de limite do plano. */
  readonly usuario = inject(AuthService).usuarioLogado;

  campaigns: Campaign[] = [];
  carregando = true;
  private sessoesPor = new Map<number, number>();
  private heroisPor = new Map<number, number>();

  ngOnInit(): void {
    this.campaignService.getAll().subscribe({
      next: (response: Campaign[]) => {
        this.campaigns = [...response];
        this.carregando = false;
        this.cdr.detectChanges();
      },
      error: (error: unknown) => {
        console.error('Erro ao buscar campanhas:', error);
        this.carregando = false;
        this.cdr.detectChanges();
      },
    });

    // Os números do rodapé de cada capa; se falharem, a lista continua funcionando
    this.sessaoService.getAll().subscribe({
      next: lista => {
        lista.forEach(s => this.sessoesPor.set(s.campanhaId, (this.sessoesPor.get(s.campanhaId) ?? 0) + 1));
        this.cdr.detectChanges();
      },
    });
    this.personagemService.getAll().subscribe({
      next: lista => {
        lista.filter(p => p.tipoId === 1).forEach(p => this.heroisPor.set(p.campanhaId, (this.heroisPor.get(p.campanhaId) ?? 0) + 1));
        this.cdr.detectChanges();
      },
    });
  }

  sessoes(c: Campaign): number {
    return this.sessoesPor.get(c.campanhaId!) ?? 0;
  }

  herois(c: Campaign): number {
    return this.heroisPor.get(c.campanhaId!) ?? 0;
  }

  capa(c: Campaign): string {
    return capaDoNome(c.nome);
  }
}
