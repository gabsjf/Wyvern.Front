import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { PapelService } from '../../../campaigns/services/papel.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Emblema } from '../../../shared/ui/emblema/emblema';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Campaign } from '../../../campaigns/models/campaign';

@Component({
  selector: 'app-personagem-list',
  imports: [CommonModule, FormsModule, RouterModule, Emblema],
  templateUrl: './personagem-list.html',
  styleUrl: './personagem-list.scss',
})
export class PersonagemList implements OnInit {
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  private papelService = inject(PapelService);
  private campaignService = inject(CampaignService);
  private toast = inject(ToastService);
  private nomesCampanha = new Map<number, string>();
  personagens: Personagem[] = [];
  activeTab: string = 'herois';
  // A aba de NPCs/monstros só aparece para quem é Mestre de alguma campanha
  ehMestreEmAlguma = false;


  /** Campanhas em que o usuário é Mestre: os destinos possíveis de uma cópia. */
  campanhasDoMestre: Campaign[] = [];

  // ----- duplicar (biblioteca de criaturas) -----
  duplicando: Personagem | null = null;
  destinoId: number | null = null;
  nomeCopia = '';
  duplicandoAgora = false;

  abrirDuplicar(personagem: Personagem) {
    this.duplicando = personagem;
    // por padrão a cópia fica na mesma campanha, se o usuário for Mestre dela
    const mesma = this.campanhasDoMestre.find(c => c.campanhaId === personagem.campanhaId);
    this.destinoId = (mesma ?? this.campanhasDoMestre[0])?.campanhaId ?? null;
    this.nomeCopia = '';
  }

  fecharDuplicar() {
    if (!this.duplicandoAgora) this.duplicando = null;
  }

  confirmarDuplicar() {
    const original = this.duplicando;
    if (!original?.personagemId || this.destinoId === null || this.duplicandoAgora) return;

    this.duplicandoAgora = true;
    this.personagemService.duplicar(original.personagemId, { campanhaId: this.destinoId, nome: this.nomeCopia.trim() || undefined }).subscribe({
      next: copia => {
        this.duplicandoAgora = false;
        this.duplicando = null;
        this.toast.ok(`“${copia.nome}” foi adicionado à campanha ${this.nomeDaCampanha(copia.campanhaId)}.`);
        this.loadPersonagens();
      },
      error: err => {
        this.duplicandoAgora = false;
        this.toast.erro(err.error?.detail || 'Não foi possível duplicar o personagem.');
        this.cdr.detectChanges();
      },
    });
  }

  busca = '';
  campanhaFiltro: number | null = null;

  get filteredPersonagens() {
    const termo = this.busca.trim().toLowerCase();
    return this.personagens.filter(p =>
      (this.activeTab === 'herois' ? p.tipoId === 1 : p.tipoId !== 1) &&
      (this.campanhaFiltro === null || p.campanhaId === this.campanhaFiltro) &&
      (!termo || p.nome.toLowerCase().includes(termo) || (p.descricao ?? '').toLowerCase().includes(termo)));
  }

  /** Campanhas que têm personagens (para os filtros). */
  get campanhasDosPersonagens(): { id: number; nome: string }[] {
    const ids = [...new Set(this.personagens.map(p => p.campanhaId))];
    return ids.map(id => ({ id, nome: this.nomeDaCampanha(id) }));
  }

  contar(aba: 'herois' | 'monstros'): number {
    return this.personagens.filter(p => (aba === 'herois' ? p.tipoId === 1 : p.tipoId !== 1)).length;
  }

  rotuloTipo(p: Personagem): string {
    return p.tipoId === 1 ? 'Herói' : p.tipoId === 2 ? 'NPC' : 'Monstro';
  }

  alternarCampanha(id: number) {
    this.campanhaFiltro = this.campanhaFiltro === id ? null : id;
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  nomeDaCampanha(id: number): string {
    return this.nomesCampanha.get(id) ?? 'Campanha';
  }

  ngOnInit() {
    this.loadPersonagens();
    this.campaignService.getAll().subscribe({
      next: (lista) => {
        lista.forEach(c => this.nomesCampanha.set(c.campanhaId!, c.nome));
        this.campanhasDoMestre = lista.filter(c => c.papel === 'Mestre');
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
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
