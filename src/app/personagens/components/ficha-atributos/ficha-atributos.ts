import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-ficha-atributos',
  imports: [],
  templateUrl: './ficha-atributos.html',
  styleUrl: './ficha-atributos.scss',
})
export class FichaAtributos {
  @Input() personagem: any;

  getMod(score: number | undefined): string {
    if (score === undefined || score === null) return '+0';
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }
}
