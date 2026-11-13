import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalShell } from '../legal-shell/legal-shell';
import { DADOS_LEGAIS } from '../dados-legais';

/** Termos de uso: público, aberto pelo rodapé e pelo cadastro. */
@Component({
  selector: 'app-termos',
  imports: [LegalShell, RouterLink],
  templateUrl: './termos.html',
})
export class Termos {
  readonly dados = DADOS_LEGAIS;
}
