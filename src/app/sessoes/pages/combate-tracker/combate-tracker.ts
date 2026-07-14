import { Component, OnInit, Input, SimpleChanges, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  private combateService = inject(CombateService);
  private cdr = inject(ChangeDetectorRef);

  @Input() sessaoId!: number;
  @Input() campanhaId!: number;
  
  personagensFull: any[] = [];
  personagens: any[] = []; // Filtrados pela campanha
  
  participantesSelecionados: any[] = [];
  combateAtivo: any = null; 
  participantesCombate: any[] = [];
  
  ngOnInit() {
    this.carregarDadosIniciais();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sessaoId'] || changes['campanhaId']) {
      this.filtrarPersonagens();
      this.carregarCombateAtivo();
    }
  }

  carregarDadosIniciais() {
    this.personagemService.getAll().subscribe({
      next: (data) => {
        this.personagensFull = data;
        this.filtrarPersonagens();
        this.cdr.detectChanges();
      },
      error: (err) => console.error(err)
    });

    this.carregarCombateAtivo();
  }

  carregarCombateAtivo() {
    if (!this.sessaoId) return;
    
    // Agora busca o combate por sessaoId ao invés de campanhaId
    this.combateService.getActiveCombatBySessao(this.sessaoId).subscribe({
      next: (combat: any) => {
        if (combat) {
          this.combateAtivo = combat;
          this.participantesCombate = combat.participantes || [];
        } else {
          this.combateAtivo = null;
          this.participantesCombate = [];
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error(err)
    });
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
        isInimigo: personagem.tipoId !== 1
      });
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
    if (this.combateAtivo) {
      this.combateAtivo.turnoAtualIndex++;
      if (this.combateAtivo.turnoAtualIndex >= this.participantesCombate.length) {
        this.combateAtivo.turnoAtualIndex = 0;
        this.combateAtivo.rodadaAtual++;
      }
      this.cdr.detectChanges();
      
      if (this.combateAtivo.combateId) {
         this.combateService.nextTurn(this.combateAtivo.combateId).subscribe();
      }
    }
  }

  aplicarDano(p: any, valor: string, ehCura: boolean) {
    const amount = parseInt(valor);
    if (!isNaN(amount)) {
      if (ehCura) {
        p.vidaAtual = Math.min(p.vidaMaxima, p.vidaAtual + amount);
      } else {
        p.vidaAtual = Math.max(0, p.vidaAtual - amount);
      }
      this.salvarParticipante(p);
    }
  }

  salvarParticipante(p: any) {
    if (this.combateAtivo?.combateId) {
      this.combateService.updateParticipante(this.combateAtivo.combateId, p.participanteId, {
        vidaAtual: p.vidaAtual,
        condicoes: p.condicoes
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
