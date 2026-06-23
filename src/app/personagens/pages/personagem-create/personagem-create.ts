import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';

@Component({
  selector: 'app-personagem-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './personagem-create.html',
  styleUrl: './personagem-create.scss',
})
export class PersonagemCreate implements OnInit {
  private personagemService = inject(PersonagemService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);

  campanhas: Campaign[] = [];

  personagem: Personagem = {
    nome: '',
    descricao: '',
    campanhaId: 0,
    tipoId: 1,
    criadoPorId: 1, // mock
    criadoEm: new Date().toISOString(),
    ativo: true
  };

  ngOnInit() {
    this.campaignService.getAll().subscribe({
      next: (data) => this.campanhas = data,
      error: (err) => console.error('Erro ao buscar campanhas:', err)
    });
  }

  save() {
    this.personagemService.create(this.personagem).subscribe({
      next: () => {
        this.router.navigate(['/personagens']);
      },
      error: (err) => {
        console.error('Erro ao criar personagem', err);
      }
    });
  }
}
