import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-personagem-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './personagem-list.html',
  styleUrl: './personagem-list.scss',
})
export class PersonagemList implements OnInit {
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  personagens: Personagem[] = [];
  activeTab: string = 'herois';

  get userRole(): string {
    return this.authService.userRole || 'Jogador';
  }

  get filteredPersonagens() {
    return this.personagens.filter(p => this.activeTab === 'herois' ? p.tipoId === 1 : p.tipoId !== 1);
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  ngOnInit() {
    this.loadPersonagens();
  }

  loadPersonagens() {
    this.personagemService.getAll().subscribe({
      next: (data) => {
        this.personagens = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erro ao buscar personagens', err);
      }
    });
  }
}
