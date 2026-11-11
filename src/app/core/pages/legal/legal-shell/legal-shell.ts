import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DADOS_LEGAIS } from '../dados-legais';

/** Moldura das páginas públicas de Termos e Privacidade: marca, título, texto e rodapé com os dois links. */
@Component({
  selector: 'app-legal-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './legal-shell.html',
  styleUrl: './legal-shell.scss',
})
export class LegalShell {
  readonly titulo = input.required<string>();
  readonly dados = DADOS_LEGAIS;
}
