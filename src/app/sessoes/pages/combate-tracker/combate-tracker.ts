import { Component, OnInit, Input, SimpleChanges, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { CombateService } from '../../services/combate.service';
import { CampaignService } from '../../../campaigns/services/campaign';

@Component({
  selector: 'app-combate-tracker',
  imports: [CommonModule, FormsModule],
  templateUrl: './combate-tracker.html',
  styleUrl: './combate-tracker.scss'
})
export class CombateTracker implements OnInit, OnChanges {
  private personagemService = inject(PersonagemService);
  private authService = inject(AuthService);
  private combateService = inject(CombateService);
  private cdr = inject(ChangeDetectorRef);

  @Input() sessaoId!: number;
  @Input() campanhaId!: number;
  
  personagensFull: any[] = [];
  personagens: any[] = []; // Filtrados pela campanha
  
  participantesSelecionados: any[] = [];
  combateAtivo: any = null; 
  participantesCombate: any[] = [];
  turnDeathSaveModified: boolean = false;
  isProcessingTurn: boolean = false;
  
  userRole: string = 'Mestre'; // 'Mestre' ou 'Jogador'
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
  diceBox: any = null;
  diceResult: string = '';
  diceFormula: string = '1d20';
  
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

  determinarRole() {
    this.userRole = this.authService.userRole || 'Jogador';
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
    this.initDiceBox();
  }

  async initDiceBox() {
    try {
      const DiceBox = (await import('@3d-dice/dice-box')).default;
      this.diceBox = new DiceBox("#dice-box", {
        assetPath: '/assets/dice-box/', // Will point to public folder or use CDN later if needed
        theme: "default",
        themeColor: "#6464ff",
        scale: 6, // Scale acts as camera zoom. Lower scale = more space.
        width: window.innerWidth,
        height: window.innerHeight,
        throwForce: 3,
        startingHeight: 6,
        spinForce: 4
      });
      await this.diceBox.init();

      // Add resize listener
      window.addEventListener("resize", () => {
        if (this.diceBox) {
          this.diceBox.updateConfig({
            width: window.innerWidth,
            height: window.innerHeight
          });
        }
      });
    } catch (e) {
      console.warn("DiceBox failed to init. Did you serve the assets?", e);
    }
  }

  rolarDados() {
    if (this.diceBox && this.diceFormula) {
      // Generate a random bright hex color
      const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      
      this.diceBox.roll(this.diceFormula, { themeColor: randomColor }).then((result: any) => {
        const total = result.reduce((acc: number, group: any) => acc + group.value, 0);
        this.diceResult = `Resultado: ${total}`;
        this.cdr.detectChanges();
        
        // Clear dice after 4 seconds
        setTimeout(() => {
          this.diceBox.clear();
        }, 4000);
      });
    }
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
      if (p.isInimigo) {
        const modDes = p.atributo ? Math.floor((p.atributo.destreza - 10) / 2) : 0;
        p.iniciativa = Math.floor(Math.random() * 20) + 1 + modDes;
      }
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

  obterStatusVida(p: any): { text: string, color: string } {
    if (p.vidaAtual <= 0) return { text: p.isInimigo ? 'Abatido' : 'Caído / Inconsciente', color: '#666' };
    const percent = p.vidaAtual / p.vidaMaxima;
    if (percent > 0.75) return { text: 'Saudável', color: '#4caf50' }; // Verde
    if (percent > 0.35) return { text: 'Machucado', color: '#ffeb3b' }; // Amarelo
    if (percent > 0.15) return { text: 'Muito Machucado', color: '#ff9800' }; // Laranja
    return { text: 'Quase Morto', color: '#f44336' }; // Vermelho
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
