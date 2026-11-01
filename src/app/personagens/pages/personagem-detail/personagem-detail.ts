import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { CampaignService } from '../../../campaigns/services/campaign';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-personagem-detail',
  imports: [CommonModule, RouterModule],
  templateUrl: './personagem-detail.html',
  styleUrl: './personagem-detail.scss',
})
export class PersonagemDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  private campaignService = inject(CampaignService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  personagem: Personagem | null = null;
  nomeDaCampanha = 'Campanha';
  isLoading = true;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.personagemService.getById(id).subscribe({
        next: (data) => {
          this.personagem = data;
          this.isLoading = false;
          this.cdr.detectChanges();
          this.campaignService.getAll().subscribe(lista => {
            this.nomeDaCampanha = lista.find(c => c.campanhaId === data.campanhaId)?.nome ?? 'Campanha';
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          console.error('Erro ao buscar personagem', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  getTipoName(tipoId: number): string {
    switch (tipoId) {
      case 1: return 'Jogador (PC)';
      case 2: return 'NPC';
      case 3: return 'Monstro';
      default: return 'Desconhecido';
    }
  }

  async deletePersonagem() {
    if (!this.personagem?.personagemId) return;
    const id = this.personagem.personagemId;

    const confirmado = await this.confirm.confirmar({
      titulo: 'Excluir personagem',
      mensagem: `“${this.personagem.nome}” será removido da campanha. Esta ação não pode ser desfeita.`,
      confirmar: 'Excluir personagem',
      perigo: true,
    });
    if (!confirmado) return;

    this.personagemService.delete(id).subscribe({
      next: () => {
        this.toast.ok('Personagem excluído.');
        this.router.navigate(['/personagens']);
      },
      error: (err) => {
        console.error('Erro ao deletar personagem', err);
        this.toast.erro('Não foi possível excluir o personagem. Tente novamente.');
      }
    });
  }
}