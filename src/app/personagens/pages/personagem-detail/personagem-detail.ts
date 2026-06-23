import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';

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

  personagem: Personagem | null = null;
  isLoading = true;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.personagemService.getById(id).subscribe({
        next: (data) => {
          this.personagem = data;
          this.isLoading = false;
          this.cdr.detectChanges();
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

  showDeleteModal = false;

  deletePersonagem() {
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
  }

  confirmDelete() {
    if (this.personagem?.personagemId) {
      this.personagemService.delete(this.personagem.personagemId).subscribe({
        next: () => {
          this.router.navigate(['/personagens']);
        },
        error: (err) => {
          console.error('Erro ao deletar personagem', err);
          this.showDeleteModal = false;
        }
      });
    }
  }
}
