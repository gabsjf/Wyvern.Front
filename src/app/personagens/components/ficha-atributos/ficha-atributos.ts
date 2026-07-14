import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-ficha-atributos',
  imports: [],
  templateUrl: './ficha-atributos.html',
  styleUrl: './ficha-atributos.scss',
})
export class FichaAtributos {
  @Input() personagem: any;

  getModValue(score: number | undefined): number {
    if (score === undefined || score === null) return 0;
    return Math.floor((score - 10) / 2);
  }

  getMod(score: number | undefined): string {
    const mod = this.getModValue(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  getProficienciaBonus(): number {
    return this.personagem?.personagemCombate?.proficienciaBonus || 0;
  }

  isProficient(periciaNome: string): boolean {
    if (!this.personagem?.personagemPericias) return false;
    return this.personagem.personagemPericias.some((p: any) => p.pericia && p.pericia.nome.toLowerCase() === periciaNome.toLowerCase());
  }

  isSaveProficient(atributo: string): boolean {
    if (!this.personagem?.atributo) return false;
    switch(atributo.toLowerCase()) {
      case 'forca': return this.personagem.atributo.proficienciaSalvaguardaForca;
      case 'destreza': return this.personagem.atributo.proficienciaSalvaguardaDestreza;
      case 'constituicao': return this.personagem.atributo.proficienciaSalvaguardaConstituicao;
      case 'inteligencia': return this.personagem.atributo.proficienciaSalvaguardaInteligencia;
      case 'sabedoria': return this.personagem.atributo.proficienciaSalvaguardaSabedoria;
      case 'carisma': return this.personagem.atributo.proficienciaSalvaguardaCarisma;
      default: return false;
    }
  }

  getSkillValue(periciaNome: string, score: number | undefined): string {
    let val = this.getModValue(score);
    if (this.isProficient(periciaNome)) {
      val += this.getProficienciaBonus();
    }
    return val >= 0 ? `+${val}` : `${val}`;
  }

  getSaveValue(atributo: string, score: number | undefined): string {
    let val = this.getModValue(score);
    if (this.isSaveProficient(atributo)) {
      val += this.getProficienciaBonus();
    }
    return val >= 0 ? `+${val}` : `${val}`;
  }
}
