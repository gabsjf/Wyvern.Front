import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalShell } from '../legal-shell/legal-shell';
import { DADOS_LEGAIS } from '../dados-legais';

/** Política de privacidade (LGPD): público, aberto pelo rodapé e pelo cadastro. */
@Component({
  selector: 'app-privacidade',
  imports: [LegalShell, RouterLink],
  templateUrl: './privacidade.html',
})
export class Privacidade {
  readonly dados = DADOS_LEGAIS;
}
