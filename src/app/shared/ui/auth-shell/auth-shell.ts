import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Moldura das telas de acesso (login, esqueci a senha, redefinir, confirmar e-mail):
 * ilustração à esquerda e o conteúdo projetado à direita.
 * Sem encapsulamento de propósito: as classes .auth-* abaixo também estilizam o conteúdo projetado.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [RouterLink],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.scss',
})
export class AuthShell {}
