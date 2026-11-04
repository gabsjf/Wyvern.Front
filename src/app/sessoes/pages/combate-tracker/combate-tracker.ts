import { Component, OnInit, Input, SimpleChanges, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { CombateService } from '../../services/combate.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { PapelService } from '../../../campaigns/services/papel.service';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { CONDICOES, alternarCondicao, lerCondicoes, temCondicao } from '../../../personagens/utils/condicoes';
import { analisarFormula, sortearFaces, totalDaRolagem } from '../../../core/utils/formula-dados';

@Component({
  selector: 'app-combate-tracker',
  imports: [CommonModule, FormsModule, NgTemplateOutlet],
  templateUrl: './combate-tracker.html',
  styleUrl: './combate-tracker.scss'
})
export class CombateTracker implements OnInit, OnChanges {
  private personagemService = inject(PersonagemService);
  private authService = inject(AuthService);
  private papelService = inject(PapelService);
  private combateService = inject(CombateService);
  private cdr = inject(ChangeDetectorRef);
  private mesa = inject(MesaService);
  private toast = inject(ToastService);

  @Input() sessaoId!: number;
  @Input() campanhaId!: number;
  
  personagensFull: any[] = [];
  personagens: any[] = []; // Filtrados pela campanha
  
  participantesSelecionados: any[] = [];
  combateAtivo: any = null; 
  participantesCombate: any[] = [];
  turnDeathSaveModified: boolean = false;
  isProcessingTurn: boolean = false;
  
  userRole: string = 'Jogador'; // papel nesta campanha: 'Mestre' ou 'Jogador' (começa restrito até a API responder)
  userId: number = 0; // We might need this for ownership, but we don't have it easily. Let's rely on role and Personagem ownership. Wait, `PersonagemService.getAll()` returns only characters owned by the user. If they are in the list, it's theirs!
  personagensMeusIds: number[] = [];

  // Quick NPC Form
  novoNpc: any = {
    nome: '',
    vidaMaxima: 10,
    classeArmadura: 10,
    iniciativa: 10
  };

  // Death Saves Control
  previousTurnIndex: number = -1;

  // Dice Roller
  diceResult: string = '';
  diceFormula: string = '1d20';
  /** Resultado da última rolagem em destaque e as anteriores (mais recente primeiro). */
  ultimoTotal: number | null = null;
  ultimaFormula = '';
  historico: { formula: string; total: number }[] = [];
  readonly dadosRapidos = [4, 6, 8, 10, 12, 20, 100];

  estaMorto(p: any): boolean {
    return (p.isInimigo && p.vidaAtual <= 0) || (!p.isInimigo && p.falhasMorte >= 3);
  }

  rolarRapido(faces: number) {
    this.diceFormula = `1d${faces}`;
    this.rolarDados();
  }

  ngOnInit() {
    this.carregarDadosIniciais();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sessaoId'] || changes['campanhaId']) {
      this.filtrarPersonagens();
      this.carregarCombateAtivo();
      this.determinarRole();
    }
  }

  // Papel do usuário NESTA campanha (Mestre numa mesa pode ser Jogador em outra)
  determinarRole() {
    if (!this.campanhaId) return;
    this.papelService.papelNaCampanha(this.campanhaId).subscribe({
      next: (papel) => {
        this.userRole = papel ?? 'Jogador';
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao descobrir o papel na campanha', err)
    });
  }

  carregarDadosIniciais() {
    this.personagemService.getAll().subscribe({
      next: (data) => {
        this.personagensFull = data;
        this.personagensMeusIds = data.map(p => p.personagemId).filter((id): id is number => id !== undefined);
        this.filtrarPersonagens();
        this.cdr.detectChanges();
      },
      error: (err) => console.error(err)
    });

    this.carregarCombateAtivo();
  }

  /** Rola a fórmula digitada; o resultado aparece para a mesa inteira (a camada de dados 3D é global). */
  async rolarDados() {
    const formula = this.diceFormula?.trim();
    if (!formula) return;

    try {
      const r = await this.mesa.rolar('Dados', formula);
      this.diceResult = `Resultado: ${r.total}`;
      this.ultimoTotal = r.total;
      this.ultimaFormula = r.formula;
      this.historico = [{ formula: r.formula, total: r.total }, ...this.historico].slice(0, 8);
    } catch {
      this.diceResult = 'Fórmula inválida. Exemplos: 1d20+5, 2d6, 4d6+2.';
      this.ultimoTotal = null;
    }
    this.cdr.detectChanges();
  }

  carregarCombateAtivo() {
    if (!this.sessaoId) return;
    
    // Agora busca o combate por sessaoId ao invés de campanhaId
    this.combateService.getActiveCombatBySessao(this.sessaoId).subscribe({
      next: (combat: any) => {
        if (combat) {
          const needsStartConnection = this.combateAtivo?.combateId !== combat.combateId;
          
          if (this.previousTurnIndex !== combat.turnoAtualIndex) {
            this.turnDeathSaveModified = false;
            this.previousTurnIndex = combat.turnoAtualIndex;
          }

          this.combateAtivo = combat;
          this.participantesCombate = combat.participantes || [];

          if (needsStartConnection) {
            this.combateService.startConnection(combat.combateId, () => {
              this.carregarCombateAtivo();
            });
          }
        } else {
          this.combateAtivo = null;
          this.participantesCombate = [];
          
          // Connect to the session group to listen for new combats
          this.combateService.startSessaoConnection(this.sessaoId!, () => {
            this.carregarCombateAtivo();
          });
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error(err)
    });
  }

  ngOnDestroy() {
    if (this.combateAtivo?.combateId) {
      this.combateService.stopConnection(this.combateAtivo.combateId);
    }
    if (this.sessaoId) {
      this.combateService.stopSessaoConnection(this.sessaoId);
    }
  }

  filtrarPersonagens() {
    if (this.campanhaId && this.personagensFull.length > 0) {
      this.personagens = this.personagensFull.filter(p => p.campanhaId == this.campanhaId);
    } else {
      this.personagens = [];
    }
    this.cdr.detectChanges();
  }


  // ----- preparação: cópias numeradas, PV sorteado e iniciativa automática -----
  readonly condicoesPadrao = CONDICOES;
  /** Quantas cópias adicionar de cada criatura (por personagemId). */
  quantidades: Record<number, number> = {};
  /** Sorteia os PV de cada cópia pela fórmula do monstro (ex.: 2d8+2), se ela existir. */
  sortearPv = true;

  quantidadeDe(personagem: any): number {
    return this.quantidades[personagem.personagemId] ?? 1;
  }

  ajustarQuantidade(personagem: any, passo: number) {
    this.quantidades[personagem.personagemId] = Math.min(20, Math.max(1, this.quantidadeDe(personagem) + passo));
  }

  ehHeroi(personagem: any): boolean {
    return personagem.tipoId === 1;
  }

  /** Heróis entram uma vez; monstros e NPCs entram em quantas cópias se pedir, numeradas ("Goblin 1", "Goblin 2"). */
  adicionarComQuantidade(personagem: any) {
    if (this.ehHeroi(personagem)) {
      this.adicionarParticipante(personagem);
      return;
    }

    const quantidade = this.quantidadeDe(personagem);
    for (let i = 0; i < quantidade; i++) {
      const vida = this.vidaInicial(personagem);
      this.participantesSelecionados.push({
        ...personagem,
        iniciativa: this.rolarIniciativaDe(personagem),
        vidaAtual: vida,
        vidaMaxima: vida,
        classeArmadura: personagem.personagemCombate?.classeArmadura || 10,
        isInimigo: true,
        sucessosMorte: 0,
        falhasMorte: 0,
      });
    }
    this.numerarCopias(personagem);
    this.quantidades[personagem.personagemId] = 1;
    this.cdr.detectChanges();
  }

  /** PV de uma cópia: sorteado pela fórmula do monstro, ou o valor fixo da ficha. */
  private vidaInicial(personagem: any): number {
    const fixa = personagem.personagemCombate?.vidaMaxima || 10;
    const formula = analisarFormula(personagem.personagemNpc?.formulaDadoVida ?? '');
    if (!this.sortearPv || !formula) return fixa;
    return Math.max(1, totalDaRolagem(formula, sortearFaces(formula)));
  }

  /** Se há mais de uma cópia da mesma criatura, todas ganham número (a primeira também). */
  private numerarCopias(personagem: any) {
    const copias = this.participantesSelecionados.filter(p => p.personagemId === personagem.personagemId);
    if (copias.length < 2) return;
    copias.forEach((c, i) => (c.nome = `${personagem.nome} ${i + 1}`));
  }

  /** Bônus de iniciativa: o da ficha, ou o modificador de Destreza. */
  bonusIniciativa(p: any): number {
    const daFicha = p.personagemCombate?.iniciativa;
    if (daFicha) return daFicha;
    return p.atributo?.destreza ? Math.floor((p.atributo.destreza - 10) / 2) : 0;
  }

  private rolarIniciativaDe(p: any): number {
    const formula = analisarFormula('1d20')!;
    return totalDaRolagem(formula, sortearFaces(formula)) + this.bonusIniciativa(p);
  }

  rolarIniciativaParticipante(p: any) {
    p.iniciativa = this.rolarIniciativaDe(p);
    this.cdr.detectChanges();
  }

  rolarIniciativaTodos() {
    this.participantesSelecionados.forEach(p => (p.iniciativa = this.rolarIniciativaDe(p)));
    this.cdr.detectChanges();
  }

  // ----- condições (em vez de texto livre) -----
  condicoesDe(p: any): string[] {
    return lerCondicoes(p.condicoes);
  }

  adicionarCondicao(p: any, nome: string) {
    if (!nome || temCondicao(p.condicoes, nome)) return;
    p.condicoes = alternarCondicao(p.condicoes, nome);
    this.salvarParticipante(p);
  }

  removerCondicao(p: any, nome: string) {
    p.condicoes = alternarCondicao(p.condicoes, nome);
    this.salvarParticipante(p);
  }

  temCondicao(p: any, nome: string): boolean {
    return temCondicao(p.condicoes, nome);
  }

  adicionarParticipante(personagem: any) {
    if (!this.participantesSelecionados.find(p => p.personagemId === personagem.personagemId)) {
      this.participantesSelecionados.push({
        ...personagem,
        iniciativa: 0,
        vidaAtual: personagem.personagemCombate?.vidaAtual || 10,
        vidaMaxima: personagem.personagemCombate?.vidaMaxima || 10,
        classeArmadura: personagem.personagemCombate?.classeArmadura || 10,
        isInimigo: personagem.tipoId !== 1,
        sucessosMorte: 0,
        falhasMorte: 0
      });
      this.cdr.detectChanges();
    }
  }

  adicionarNpcRapido() {
    if (this.novoNpc.nome.trim()) {
      this.participantesSelecionados.push({
        personagemId: null, // Genérico
        nome: this.novoNpc.nome,
        iniciativa: this.novoNpc.iniciativa,
        vidaAtual: this.novoNpc.vidaMaxima,
        vidaMaxima: this.novoNpc.vidaMaxima,
        classeArmadura: this.novoNpc.classeArmadura,
        isInimigo: true
      });
      // Reset form
      this.novoNpc = { nome: '', vidaMaxima: 10, classeArmadura: 10, iniciativa: 10 };
      this.cdr.detectChanges();
    }
  }

  removerParticipanteSelecionado(index: number) {
    this.participantesSelecionados.splice(index, 1);
    this.cdr.detectChanges();
  }

  rolarIniciativaMonstros() {
    this.participantesSelecionados.forEach(p => {
      if (p.isInimigo) p.iniciativa = this.rolarIniciativaDe(p);
    });
    this.cdr.detectChanges();
  }

  iniciarCombate() {
    if (!this.sessaoId) return;

    const payload = {
      sessaoId: this.sessaoId,
      campanhaId: this.campanhaId,
      participantes: this.participantesSelecionados.map(p => ({
        personagemId: p.personagemId,
        nomeNPC: p.nome,
        iniciativa: p.iniciativa,
        vidaAtual: p.vidaAtual,
        vidaMaxima: p.vidaMaxima,
        classeArmadura: p.classeArmadura,
        isInimigo: p.isInimigo,
        condicoes: ''
      }))
    };

    this.combateService.startCombate(payload).subscribe({
      next: (res) => {
        this.combateAtivo = res;
        this.participantesCombate = res.participantes?.sort((a:any, b:any) => b.iniciativa - a.iniciativa) || [];
        this.participantesSelecionados = [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error(err)
    });
  }

  proximoTurno() {
    if (this.combateAtivo && this.participantesCombate.length > 0) {
      let startIndex = this.combateAtivo.turnoAtualIndex;
      do {
        this.combateAtivo.turnoAtualIndex++;
        if (this.combateAtivo.turnoAtualIndex >= this.participantesCombate.length) {
          this.combateAtivo.turnoAtualIndex = 0;
          this.combateAtivo.rodadaAtual++;
        }

        let p = this.participantesCombate[this.combateAtivo.turnoAtualIndex];
        let isMorto = (p.isInimigo && p.vidaAtual <= 0) || (!p.isInimigo && p.falhasMorte >= 3);
        if (!isMorto) break;

      } while (this.combateAtivo.turnoAtualIndex !== startIndex);

      this.turnDeathSaveModified = false;
      this.cdr.detectChanges();
      
      if (this.combateAtivo.combateId) {
         this.isProcessingTurn = true;
         this.combateService.nextTurn(this.combateAtivo.combateId).subscribe({
           next: () => {
             this.isProcessingTurn = false;
             this.cdr.detectChanges();
           },
           error: (err) => {
             this.isProcessingTurn = false;
             console.error(err);
           }
         });
      }
    }
  }

  aplicarDano(p: any, valor: string, isCura: boolean) {
    const amount = parseInt(valor);
    if (isNaN(amount) || amount <= 0) return;

    if (isCura) {
      p.vidaAtual = Math.min(p.vidaAtual + amount, p.vidaMaxima);
      if (p.vidaAtual > 0 && !p.isInimigo) {
        p.sucessosMorte = 0;
        p.falhasMorte = 0;
      }
    } else {
      p.vidaAtual = Math.max(p.vidaAtual - amount, 0);
      // regra de concentração: salvaguarda de Constituição com CD 10 ou metade do dano, o que for maior
      if (this.temCondicao(p, 'Concentrando') && p.vidaAtual > 0) {
        this.toast.info(`${p.nomeNPC} está concentrado: teste de Constituição, CD ${Math.max(10, Math.floor(amount / 2))}.`);
      }
    }

    this.salvarParticipante(p);
  }

  isMeuPersonagem(personagemId: number): boolean {
    return this.personagensMeusIds.includes(personagemId);
  }

  podeAgir(p: any): boolean {
    if (this.userRole === 'Mestre') return true;
    return this.isMeuPersonagem(p.personagemId);
  }

  // Para quem não controla o personagem: só um estado qualitativo da vida, sem números.
  obterStatusVida(p: any): { text: string, tone: 'ok' | 'hi' | 'danger' | 'muted' } {
    if (p.vidaAtual <= 0) return { text: p.isInimigo ? 'Abatido' : 'Caído / inconsciente', tone: 'muted' };
    const percent = p.vidaAtual / p.vidaMaxima;
    if (percent > 0.75) return { text: 'Saudável', tone: 'ok' };
    if (percent > 0.35) return { text: 'Machucado', tone: 'hi' };
    if (percent > 0.15) return { text: 'Muito machucado', tone: 'danger' };
    return { text: 'Quase morto', tone: 'danger' };
  }

  toggleSucessoMorte(p: any, value: number, isTurn: boolean) {
    if (!isTurn || p.falhasMorte >= 3) return; // Só rola no próprio turno ou se não estiver morto

    // Se clicar no atual, desmarca
    if (p.sucessosMorte === value) {
      p.sucessosMorte = value - 1;
      this.turnDeathSaveModified = false;
    } else {
      if (this.turnDeathSaveModified) return; // Só 1 modificação por turno
      p.sucessosMorte = value;
      this.turnDeathSaveModified = true;
    }

    if (p.sucessosMorte >= 3) {
      // Revival
      p.sucessosMorte = 0;
      p.falhasMorte = 0;
      p.vidaAtual = 1;
    }
    
    this.salvarParticipante(p);
  }

  toggleFalhaMorte(p: any, value: number, isTurn: boolean) {
    if (!isTurn || p.sucessosMorte >= 3) return;

    if (p.falhasMorte === value) {
      p.falhasMorte = value - 1;
      this.turnDeathSaveModified = false;
    } else {
      if (this.turnDeathSaveModified) return; // Só 1 modificação por turno
      p.falhasMorte = value;
      this.turnDeathSaveModified = true;
    }

    this.salvarParticipante(p);
  }

  salvarParticipante(p: any) {
    if (p.vidaAtual < 0) p.vidaAtual = 0;
    if (this.combateAtivo?.combateId) {
      this.combateService.updateParticipante(this.combateAtivo.combateId, p.participanteId, {
        vidaAtual: p.vidaAtual,
        condicoes: p.condicoes,
        sucessosMorte: p.sucessosMorte || 0,
        falhasMorte: p.falhasMorte || 0
      }).subscribe({
        next: () => console.log('Participante salvo'),
        error: (err) => console.error(err)
      });
    }
    this.cdr.detectChanges();
  }

  encerrarCombate() {
    if (this.combateAtivo?.combateId) {
      this.combateService.endCombate(this.combateAtivo.combateId).subscribe({
        next: () => {
          this.combateAtivo = null;
          this.participantesCombate = [];
          this.participantesSelecionados = [];
          this.cdr.detectChanges();
        },
        error: (err) => console.error(err)
      });
    }
  }
}
