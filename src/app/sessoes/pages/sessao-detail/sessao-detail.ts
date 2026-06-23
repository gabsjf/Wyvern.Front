import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';

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

  sessao: Sessao | null = null;
  isLoading = true;
  showDeleteModal = false;

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

  deleteSessao() {
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
  }

  confirmDelete() {
    if (this.sessao?.sessaoId) {
      this.sessaoService.delete(this.sessao.sessaoId).subscribe({
        next: () => {
          this.router.navigate(['/sessoes']);
        },
        error: (err) => {
          console.error('Erro ao deletar sessão', err);
          this.showDeleteModal = false;
        }
      });
    }
  }
}
