import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { PapelService } from '../../../campaigns/services/papel.service';

@Component({
  selector: 'app-personagem-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './personagem-list.html',
  styleUrl: './personagem-list.scss',
})
export class PersonagemList implements OnInit {
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  private papelService = inject(PapelService);
  personagens: Personagem[] = [];
  activeTab: string = 'herois';
  // A aba de NPCs/monstros só aparece para quem é Mestre de alguma campanha
  ehMestreEmAlguma = false;


  get filteredPersonagens() {
    return this.personagens.filter(p => this.activeTab === 'herois' ? p.tipoId === 1 : p.tipoId !== 1);
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  ngOnInit() {
    this.loadPersonagens();
    this.papelService.ehMestreEmAlguma().subscribe({
      next: (ehMestre) => {
        this.ehMestreEmAlguma = ehMestre;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
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
