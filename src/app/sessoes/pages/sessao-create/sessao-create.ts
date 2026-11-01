import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sessao-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './sessao-create.html',
  styleUrl: './sessao-create.scss',
})
export class SessaoCreate implements OnInit {
  private sessaoService = inject(SessaoService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  campanhas: Campaign[] = [];
  allSessoes: Sessao[] = [];
  isEditMode = false;
  isSaving = false;

  sessao: Sessao = {
    numeroSessao: 1,
    nome: '',
    dataSessao: new Date().toISOString().split('T')[0],
    obs: '',
    campanhaId: 0,
    ativo: true
  };

  ngOnInit() {
    this.campaignService.getAll().subscribe({
      next: (data) => {
        this.campanhas = data.filter(c => c.papel === 'Mestre');
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.isEditMode = true;
      this.sessaoService.getById(id).subscribe({
        next: (data) => {
          this.sessao = data;
          if (this.sessao.dataSessao) {
            this.sessao.dataSessao = new Date(this.sessao.dataSessao).toISOString().split('T')[0];
          }
        },
        error: (err) => console.error('Erro ao carregar sessão para edição', err)
      });
    } else {
      // In create mode, fetch all sessions to calculate the next session number
      this.sessaoService.getAll().subscribe({
        next: (data) => this.allSessoes = data,
        error: (err) => console.error('Erro ao carregar sessões', err)
      });
    }
  }

  onCampanhaChange(campanhaId: number) {
    if (!this.isEditMode && campanhaId > 0 && this.allSessoes.length > 0) {
      const sessoesDaCampanha = this.allSessoes.filter(s => s.campanhaId === campanhaId);
      if (sessoesDaCampanha.length > 0) {
        const maxNumero = Math.max(...sessoesDaCampanha.map(s => s.numeroSessao));
        this.sessao.numeroSessao = maxNumero + 1;
      } else {
        this.sessao.numeroSessao = 1;
      }
    }
  }

  save() {
    if (this.isSaving) return;
    this.isSaving = true;
    this.processDataAgendada();

    if (this.isEditMode && this.sessao.sessaoId) {
      this.sessaoService.update(this.sessao.sessaoId, this.sessao).subscribe({
        next: () => {
          this.isSaving = false;
          this.router.navigate(['/sessoes', this.sessao.sessaoId]);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao atualizar sessão', err);
        }
      });
    } else {
      this.sessaoService.create(this.sessao).subscribe({
        next: () => {
          this.isSaving = false;
          this.router.navigate(['/sessoes']);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao criar sessão', err);
        }
      });
    }
  }

  private processDataAgendada() {
    if (this.sessao.dataSessao) {
      const sessaoDate = new Date(this.sessao.dataSessao);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zera a hora para comparar só o dia
      
      // Se a data escolhida for maior que hoje, consideramos como uma sessão futura (agendada)
      if (sessaoDate > today) {
        this.sessao.dataAgendada = this.sessao.dataSessao;
      } else {
        this.sessao.dataAgendada = undefined;
      }
    }
  }
}
