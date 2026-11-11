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
import { AuthService } from '../../../core/services/auth.service';

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
  private readonly meuId = inject(AuthService).usuarioLogado()?.usuarioId ?? 0;
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

  /** A busca olha o nome, a descrição, a campanha e quem é o dono. A lista sai agrupada por campanha e, nela, por nome. */
  get filteredPersonagens() {
    const termo = this.busca.trim().toLowerCase();
    return this.personagens
      .filter(p =>
        (this.activeTab === 'herois' ? p.tipoId === 1 : p.tipoId !== 1) &&
        (this.campanhaFiltro === null || p.campanhaId === this.campanhaFiltro) &&
        (!termo || [p.nome, p.descricao, this.nomeDaCampanha(p), p.criadoPorNome].some(t => (t ?? '').toLowerCase().includes(termo))))
      .sort((a, b) => this.nomeDaCampanha(a).localeCompare(this.nomeDaCampanha(b), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /** Campanhas que têm personagens na aba atual (para os filtros), com quantos cada uma tem. */
  get campanhasDosPersonagens(): { id: number; nome: string; total: number }[] {
    const daAba = this.personagens.filter(p => (this.activeTab === 'herois' ? p.tipoId === 1 : p.tipoId !== 1));
    const porCampanha = new Map<number, { id: number; nome: string; total: number }>();
    for (const p of daAba) {
      const c = porCampanha.get(p.campanhaId) ?? { id: p.campanhaId, nome: this.nomeDaCampanha(p), total: 0 };
      c.total++;
      porCampanha.set(p.campanhaId, c);
    }
    return [...porCampanha.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  ehMeu(p: Personagem): boolean {
    return p.criadoPorId === this.meuId;
  }

  /** De quem é: "Você" no que é seu; senão o nome de quem criou (o jogador, ou o Mestre nos NPCs e monstros). */
  donoDe(p: Personagem): string {
    if (this.ehMeu(p)) return p.tipoId === 1 ? 'Seu personagem' : 'Criado por você';
    const nome = p.criadoPorNome?.trim();
    if (!nome) return p.tipoId === 1 ? 'Jogador desconhecido' : 'Criado pelo Mestre';
    return p.tipoId === 1 ? nome : `Criado por ${nome}`;
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

  /** Nome da campanha: o que veio com o personagem ou, se faltar, o da lista de campanhas. */
  nomeDaCampanha(alvo: number | Personagem): string {
    if (typeof alvo !== 'number' && alvo.campanhaNome) return alvo.campanhaNome;
    const id = typeof alvo === 'number' ? alvo : alvo.campanhaId;
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
