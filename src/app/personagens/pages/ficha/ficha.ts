import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FichaHeader } from '../../components/ficha-header/ficha-header';
import { FichaAtributos } from '../../components/ficha-atributos/ficha-atributos';

import { ItemService, Item } from '../../../core/services/item.service';
import { MagiaService, Magia } from '../../../core/services/magia.service';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ficha',
  standalone: true,
  imports: [CommonModule, FormsModule, FichaHeader, FichaAtributos],
  templateUrl: './ficha.html',
  styleUrls: ['./ficha.scss']
})
export class FichaComponent implements OnInit {
  activeTab: string = 'atributos';
  personagem: any = null;
  
  showItemModal = false;
  showMagiaModal = false;
  showAtaqueModal = false;
  showImportModal = false;

  todosItens: Item[] = [];
  todasMagias: Magia[] = [];

  campanhas: Campaign[] = [];
  pendingImportFile: File | null = null;
  importCampanhaId: number | null = null;
  importing = false;

  novoAtaque = {
    nome: '',
    alcance: '',
    bonusAcerto: 0,
    dano: '',
    tipoDano: '',
    propriedades: ''
  };

  novaMagia = {
    nome: '',
    nivel: 0,
    escola: '',
    verbal: false,
    somatico: false,
    material: false,
    descricao: ''
  };

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private itemService: ItemService,
    private magiaService: MagiaService,
    private personagemService: PersonagemService,
    private campaignService: CampaignService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadPersonagem(id);
      }
    });
    this.loadGlobais();
    this.campaignService.getAll().subscribe(c => {
      this.campanhas = c;
      this.cdr.detectChanges();
    });
  }

  async loadGlobais() {
    this.itemService.getAll().subscribe(i => {
      this.todosItens = i;
      this.cdr.detectChanges();
    });
    this.magiaService.getAll().subscribe(m => {
      this.todasMagias = m;
      this.cdr.detectChanges();
    });
  }

  async loadPersonagem(id: string) {
    try {
      this.personagemService.getById(Number(id)).subscribe(p => {
        this.personagem = p;
        this.cdr.detectChanges();
      });
    } catch (e) {
      console.error(e);
    }
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  showDetalhesModal = false;
  detalhes = {
    titulo: '',
    subtitulo: '',
    descricao: ''
  };

  abrirDetalhes(titulo: string, subtitulo: string, descricao: string) {
    this.detalhes = { titulo, subtitulo, descricao: descricao || 'Sem descrição.' };
    this.showDetalhesModal = true;
  }

  novoItem = {
    nome: '',
    tipoItem: '',
    raridade: '',
    descricao: ''
  };

  adicionarItem() {
    this.personagemService.addItem(this.personagem.personagemId, this.novoItem).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
      this.showItemModal = false;
      this.novoItem = { nome: '', tipoItem: '', raridade: '', descricao: '' };
    });
  }

  removerItem(itemId: number) {
    this.personagemService.removeItem(this.personagem.personagemId, itemId).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
    });
  }

  adicionarMagia() {
    this.personagemService.addMagia(this.personagem.personagemId, this.novaMagia).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
      this.showMagiaModal = false;
      this.novaMagia = { nome: '', nivel: 0, escola: '', verbal: false, somatico: false, material: false, descricao: '' };
    });
  }

  removerMagia(magiaId: number) {
    this.personagemService.removeMagia(this.personagem.personagemId, magiaId).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
    });
  }

  salvarAtaque() {
    this.personagemService.addAtaque(this.personagem.personagemId, this.novoAtaque).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
      this.showAtaqueModal = false;
      this.novoAtaque = { nome: '', alcance: '', bonusAcerto: 0, dano: '', tipoDano: '', propriedades: '' };
    });
  }

  removerAtaque(ataqueId: number) {
    this.personagemService.removeAtaque(this.personagem.personagemId, ataqueId).subscribe(() => {
      this.loadPersonagem(this.personagem.personagemId.toString());
    });
  }
  
  importPdf() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      this.pendingImportFile = file;
      this.importCampanhaId = this.personagem?.campanhaId ?? null;
      this.showImportModal = true;
      this.cdr.detectChanges();
    };
    input.click();
  }

  confirmarImportPdf() {
    if (!this.pendingImportFile || !this.importCampanhaId) {
      alert('Selecione a campanha para a qual o personagem será importado.');
      return;
    }

    this.importing = true;
    this.personagemService.importPdf(this.pendingImportFile, this.importCampanhaId).subscribe({
      next: (data: any) => {
        this.importing = false;
        this.showImportModal = false;
        this.pendingImportFile = null;
        alert('Ficha importada com sucesso!');
        this.router.navigate(['/ficha', data.personagemId]);
      },
      error: (err) => {
        this.importing = false;
        this.cdr.detectChanges();
        console.error(err);
        alert('Erro ao importar PDF: ' + (err?.error ?? err?.message ?? 'Erro desconhecido'));
      }
    });
  }

  cancelarImportPdf() {
    this.showImportModal = false;
    this.pendingImportFile = null;
  }

  exportPdf() {
    if (!this.personagem || !this.personagem.personagemId) {
      alert('Nenhum personagem carregado para exportar!');
      return;
    }

    this.personagemService.exportPdf(this.personagem.personagemId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.personagem.nome || 'Personagem'}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error(err);
        alert('Erro ao exportar PDF.');
      }
    });
  }

  getModValue(score: number | undefined): number {
    if (score === undefined || score === null) return 0;
    return Math.floor((score - 10) / 2);
  }

  getBonusAtaque(ataque: any): string {
    let mod = 0;
    if (ataque.atributoBase && this.personagem?.atributo) {
      // Normalize to match property names
      let attr = ataque.atributoBase.toLowerCase();
      if (attr === 'constituicao') attr = 'constituicao'; // just in case
      const score = this.personagem.atributo[attr];
      mod += this.getModValue(score);
    }
    if (ataque.proficiente) {
      mod += (this.personagem?.personagemCombate?.proficienciaBonus || 0);
    }
    mod += (ataque.bonusAcerto || 0); // Flat bonus (e.g. magic weapons +1)
    
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  getDanoAtaque(ataque: any): string {
    let mod = 0;
    if (ataque.atributoBase && this.personagem?.atributo) {
      let attr = ataque.atributoBase.toLowerCase();
      const score = this.personagem.atributo[attr];
      mod += this.getModValue(score);
    }
    if (mod === 0) return ataque.dano || '';
    
    const modStr = mod > 0 ? `+${mod}` : `${mod}`;
    return `${ataque.dano || ''}${modStr}`;
  }

  getBonusMagia(): string {
    if (!this.personagem?.personagemConjuracao || this.personagem.personagemConjuracao.atributoConjuracao === 'Nenhum') return '+0';
    let attr = this.personagem.personagemConjuracao.atributoConjuracao.toLowerCase();
    if (attr === 'inteligencia') attr = 'inteligencia';
    const score = this.personagem.atributo[attr];
    const mod = this.getModValue(score);
    const pb = this.personagem?.personagemCombate?.proficienciaBonus || 0;
    const total = mod + pb;
    return total >= 0 ? `+${total}` : `${total}`;
  }

  getCdMagia(): number {
    if (!this.personagem?.personagemConjuracao || this.personagem.personagemConjuracao.atributoConjuracao === 'Nenhum') return 10;
    let attr = this.personagem.personagemConjuracao.atributoConjuracao.toLowerCase();
    const score = this.personagem.atributo[attr];
    const mod = this.getModValue(score);
    const pb = this.personagem?.personagemCombate?.proficienciaBonus || 0;
    return 8 + mod + pb;
  }

  getSlotAtual(nivel: number): number {
    if (!this.personagem?.personagemConjuracao) return 0;
    const max = this.personagem.personagemConjuracao['slotsNivel' + nivel + 'Max'];
    const atual = this.personagem.personagemConjuracao['slotsNivel' + nivel + 'Atual'];
    // Assuming if it's strictly 0 we want to show it as full if it's never been used, but since we don't have usage tracking yet, let's just return Max for now if Atual is 0, or Atual if it is > 0.
    return atual !== undefined && atual !== 0 ? atual : max;
  }
}
