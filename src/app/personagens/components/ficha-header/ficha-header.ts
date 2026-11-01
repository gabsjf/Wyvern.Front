import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ficha-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ficha-header.html',
  styleUrls: ['./ficha-header.scss']
})
export class FichaHeader {
  @Input() personagem: any;

  getIniciativaStr(): string {
    let ini = this.personagem?.personagemCombate?.iniciativa;
    if (!ini || ini === 0) {
       if (this.personagem?.atributo?.destreza) {
          ini = Math.floor((this.personagem.atributo.destreza - 10) / 2);
       } else {
          ini = 0;
       }
    }
    return ini >= 0 ? `+${ini}` : `${ini}`;
  }

  getProficienciaStr(): string {
    const pb = this.personagem?.personagemCombate?.proficienciaBonus || 0;
    return pb >= 0 ? `+${pb}` : `${pb}`;
  }

  get vidaMaxima(): number {
    return this.personagem?.personagemCombate?.vidaMaxima ?? 0;
  }

  // "??" e não "||": com 0 PV a ficha tem que mostrar 0, e não a vida máxima.
  get vidaAtual(): number {
    return this.personagem?.personagemCombate?.vidaAtual ?? this.vidaMaxima;
  }

  get vidaPct(): number {
    if (this.vidaMaxima <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((this.vidaAtual / this.vidaMaxima) * 100)));
  }

  get vidaBaixa(): boolean {
    return this.vidaPct <= 25;
  }

  get sucessosMorte(): number {
    return this.personagem?.personagemCombate?.deathSaveSucessos || 0;
  }

  get falhasMorte(): number {
    return this.personagem?.personagemCombate?.deathSaveFalhas || 0;
  }

  get dadoVida(): string {
    return this.personagem?.personagemCombate?.dadoVidaMaximo || '—';
  }
}
