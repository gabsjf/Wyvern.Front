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
}
