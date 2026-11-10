import { ErrorHandler, Provider } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as Sentry from '@sentry/angular';
import { environment } from '../../environments/environments';

/** Ligado só com `environment.sentryDsn` preenchido (produção). */
export const monitoramentoAtivo = !!environment.sentryDsn;

// Tokens de link (confirmação, redefinição, troca de e-mail) e de convite andam na URL e dão acesso: nunca saem.
const TOKEN_NA_QUERY = /(token|refreshToken|access_token|ticket)=[^&#\s]*/gi;
const TOKEN_DE_CONVITE = /\/(invite|join)\/[^/?#\s]+/gi;

/** Tira tokens de URLs e mensagens (exportado para o teste). */
export function limparTexto(texto: string): string;
export function limparTexto(texto: string | undefined): string | undefined;
export function limparTexto(texto: string | undefined): string | undefined {
  return texto?.replace(TOKEN_NA_QUERY, '$1=[removido]').replace(TOKEN_DE_CONVITE, '/$1/[removido]');
}

// Respostas esperadas da API (sessão vencida, sem permissão, não encontrado, limite) e queda de rede não são bug.
const STATUS_IGNORADOS = new Set([0, 401, 403, 404, 429]);

/** Chamado no main.ts, antes de o Angular subir. */
export function iniciarMonitoramento(): void {
  if (!monitoramentoAtivo) return;

  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    // Nada de dado pessoal automático: sem usuário, cookies, cabeçalhos, query string nem corpo das requisições.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      urlQueryParams: false,
      httpBodies: [],
    },
    tracesSampleRate: 0, // desempenho custa cota à parte; só erros por enquanto
    ignoreErrors: [
      // reconexão dos hubs (SignalR) quando a rede oscila ou a aba dorme
      'Failed to start the connection',
      'WebSocket closed with status code',
      'Invocation canceled due to the underlying connection being closed',
      'Server timeout elapsed without receiving a message from the server',
    ],
    beforeSend(evento, dica) {
      const original = dica.originalException;
      if (original instanceof HttpErrorResponse && STATUS_IGNORADOS.has(original.status)) return null;

      if (evento.request) {
        evento.request.url = limparTexto(evento.request.url);
        evento.request.query_string = undefined;
        evento.request.cookies = undefined;
        evento.request.headers = undefined;
      }
      if (evento.message) evento.message = limparTexto(evento.message);
      for (const excecao of evento.exception?.values ?? []) excecao.value = limparTexto(excecao.value);
      if (evento.user) evento.user = { id: evento.user.id };
      return evento;
    },
    beforeBreadcrumb(rastro) {
      if (rastro.message) rastro.message = limparTexto(rastro.message);
      if (rastro.data) {
        for (const chave of ['url', 'from', 'to']) {
          if (typeof rastro.data[chave] === 'string') rastro.data[chave] = limparTexto(rastro.data[chave]);
        }
      }
      return rastro;
    },
  });
}

/** Os erros do Angular vão para o Sentry (e continuam no console). Sem DSN, fica o tratador padrão. */
export function provideMonitoramento(): Provider[] {
  return monitoramentoAtivo ? [{ provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) }] : [];
}

/** Marca os erros com o id da conta logada (nada de nome ou e-mail); nulo ao sair. */
export function identificarUsuario(usuarioId: number | null): void {
  if (!monitoramentoAtivo) return;
  Sentry.setUser(usuarioId === null ? null : { id: String(usuarioId) });
}
