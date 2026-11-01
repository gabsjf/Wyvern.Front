import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-sessao-detail',
  imports: [CommonModule, RouterModule],
  templateUrl: './sessao-detail.html',
  styleUrl: './sessao-detail.scss',
})
export class SessaoDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  sessao: Sessao | null = null;
  isLoading = true;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.sessaoService.getById(id).subscribe({
        next: (data) => {
          this.sessao = data;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Erro ao buscar sessão', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteSessao() {
    if (!this.sessao?.sessaoId) return;
    const id = this.sessao.sessaoId;

    const confirmado = await this.confirm.confirmar({
      titulo: 'Excluir sessão',
      mensagem: `A sessão ${this.sessao.numeroSessao} (“${this.sessao.nome}”) e suas notas serão excluídas. Esta ação não pode ser desfeita.`,
      confirmar: 'Excluir sessão',
      perigo: true,
    });
    if (!confirmado) return;

    this.sessaoService.delete(id).subscribe({
      next: () => {
        this.toast.ok('Sessão excluída.');
        this.router.navigate(['/sessoes']);
      },
      error: (err) => {
        console.error('Erro ao deletar sessão', err);
        this.toast.erro('Não foi possível excluir a sessão. Tente novamente.');
      }
    });
  }
}