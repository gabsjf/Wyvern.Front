import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FichaHeader } from '../../components/ficha-header/ficha-header';
import { FichaAtributos, PedidoDeTeste } from '../../components/ficha-atributos/ficha-atributos';
import { MesaAoVivo } from '../../../campaigns/components/mesa-ao-vivo/mesa-ao-vivo';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { formulaD20, analisarFormula } from '../../../core/utils/formula-dados';
import { CONDICOES, alternarCondicao, lerCondicoes, temCondicao } from '../../utils/condicoes';
import { DescansoDialog, TipoDescanso } from '../../components/descanso-dialog/descanso-dialog';

import { ItemService, Item } from '../../../core/services/item.service';
import { MagiaService, Magia } from '../../../core/services/magia.service';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Campaign } from '../../../campaigns/models/campaign';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ficha',
  standalone: true,
  imports: [CommonModule, FormsModule, FichaHeader, FichaAtributos, DescansoDialog, MesaAoVivo],
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
    private toast: ToastService,
    private mesa: MesaService,
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


  // ----- rolagens -----
  /** Um teste pedido pelas perícias, salvaguardas, modificadores ou iniciativa: d20 + bônus. */
  rolarTeste(pedido: PedidoDeTeste) {
    void this.rolarFormula(pedido.rotulo, formulaD20(pedido.bonus));
  }

  async rolarFormula(rotulo: string, formula: string) {
    try {
      const r = await this.mesa.rolar(rotulo, formula, this.personagem?.nome);
      // com a mesa conectada, o resultado já aparece no painel; sem ela, avisa aqui
      if (!this.mesa.conectada()) this.toast.info(`${rotulo}: ${r.total}`);
    } catch {
      this.toast.erro(`Não consegui rolar "${formula}". Confira a fórmula do ataque na ficha.`);
    }
  }

  rolarAtaque(ataque: any) {
    void this.rolarFormula(`Ataque: ${ataque.nome}`, formulaD20(this.bonusAtaqueNumero(ataque)));
  }

  rolarDano(ataque: any) {
    const formula = this.getDanoAtaque(ataque).replace(/\s+/g, '');
    if (!analisarFormula(formula)) {
      this.toast.erro(`O dano de "${ataque.nome}" (${ataque.dano || 'vazio'}) não é uma fórmula de dados. Ex.: 1d8+3.`);
      return;
    }
    void this.rolarFormula(`Dano: ${ataque.nome}`, formula);
  }

  /** Recarrega a ficha do servidor (quando uma alteração falha ou depois de um descanso). */
  recarregar() {
    if (this.personagem?.personagemId) this.loadPersonagem(String(this.personagem.personagemId));
  }

  // ----- condições -----
  readonly condicoesPadrao = CONDICOES;

  get condicoesAtivas(): string[] {
    return lerCondicoes(this.personagem?.personagemCombate?.condicoes);
  }

  condicaoAtiva(nome: string): boolean {
    return temCondicao(this.personagem?.personagemCombate?.condicoes, nome);
  }

  alternarCondicao(nome: string) {
    const combate = this.personagem?.personagemCombate;
    if (!combate) return;
    const novas = alternarCondicao(combate.condicoes, nome);
    combate.condicoes = novas;
    this.personagemService.atualizarEstado(this.personagem.personagemId, { condicoes: novas }).subscribe({
      error: () => {
        this.toast.erro('Não foi possível salvar as condições.');
        this.recarregar();
      },
    });
  }

  // ----- espaços de magia -----
  /** Espaços não gastos de um círculo (o valor real, sem nenhum "se for zero, mostra o máximo"). */
  espacosAtuais(nivel: number): number {
    return this.personagem?.personagemConjuracao?.['slotsNivel' + nivel + 'Atual'] ?? 0;
  }

  espacosMaximos(nivel: number): number {
    return this.personagem?.personagemConjuracao?.['slotsNivel' + nivel + 'Max'] ?? 0;
  }

  /** Clicar numa marca: se está cheia, gasta a partir dela; se está vazia, recupera até ela. */
  alternarEspaco(nivel: number, indice: number) {
    const conjuracao = this.personagem?.personagemConjuracao;
    if (!conjuracao) return;
    const atual = this.espacosAtuais(nivel);
    conjuracao['slotsNivel' + nivel + 'Atual'] = indice < atual ? indice : indice + 1;

    const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => this.espacosAtuais(n));
    this.personagemService.atualizarEstado(this.personagem.personagemId, { espacosAtuais: todos }).subscribe({
      error: () => {
        this.toast.erro('Não foi possível salvar os espaços de magia.');
        this.recarregar();
      },
    });
  }

  marcas(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i);
  }

  // ----- descanso curto / longo -----
  descansoAberto: TipoDescanso | null = null;

  abrirDescanso(tipo: TipoDescanso) {
    this.descansoAberto = tipo;
  }

  fecharDescanso() {
    this.descansoAberto = null;
  }

  aoConcluirDescanso(resumo: string) {
    this.descansoAberto = null;
    this.toast.ok(resumo);
    // recarrega a ficha para mostrar PV, dados de vida e espaços de magia já com o resultado
    this.loadPersonagem(this.personagem.personagemId.toString());
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
      this.toast.erro('Selecione a campanha para a qual o personagem será importado.');
      return;
    }

    this.importing = true;
    this.personagemService.importPdf(this.pendingImportFile, this.importCampanhaId).subscribe({
      next: (data: any) => {
        this.importing = false;
        this.showImportModal = false;
        this.pendingImportFile = null;
        this.toast.ok('Ficha importada com sucesso!');
        this.router.navigate(['/ficha', data.personagemId]);
      },
      error: (err) => {
        this.importing = false;
        this.cdr.detectChanges();
        console.error(err);
        const motivo = typeof err?.error === 'string' ? err.error : (err?.error?.detail ?? err?.message ?? 'erro desconhecido');
        this.toast.erro('Não foi possível importar o PDF: ' + motivo);
      }
    });
  }

  cancelarImportPdf() {
    this.showImportModal = false;
    this.pendingImportFile = null;
  }

  exportPdf() {
    if (!this.personagem || !this.personagem.personagemId) {
      this.toast.erro('Abra uma ficha antes de exportar.');
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
        this.toast.erro('Não foi possível exportar o PDF. Tente de novo.');
      }
    });
  }

  getModValue(score: number | undefined): number {
    if (score === undefined || score === null) return 0;
    return Math.floor((score - 10) / 2);
  }

  /** Bônus de acerto como número (atributo + proficiência + bônus fixo da arma). */
  bonusAtaqueNumero(ataque: any): number {
    let mod = 0;
    if (ataque.atributoBase && this.personagem?.atributo) {
      mod += this.getModValue(this.personagem.atributo[ataque.atributoBase.toLowerCase()]);
    }
    if (ataque.proficiente) mod += this.personagem?.personagemCombate?.proficienciaBonus || 0;
    return mod + (ataque.bonusAcerto || 0);
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

}
