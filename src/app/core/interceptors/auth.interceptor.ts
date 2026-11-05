import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environments';
import { AuthService } from '../services/auth.service';

// Nestes um 401 é a resposta normal (credencial errada, refresh recusado): renovar a sessão não ajuda e causaria laço.
const SEM_RENOVACAO = ['login', 'register', 'refresh', 'logout'].map(p => `${environment.apiUrl}/Auth/${p}`);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // A sessão só vai para a nossa API, nunca para outras origens (CDNs, assets etc.).
  const ehApi = req.url.startsWith(environment.apiUrl);
  // Em /Auth/* a própria tela trata o 401 (ex.: /Auth/me ao abrir o site sem estar logado): não redireciona para o login.
  const ehAuth = req.url.startsWith(`${environment.apiUrl}/Auth/`);
  const podeRenovar = ehApi && !SEM_RENOVACAO.some(u => req.url.startsWith(u));

  // Refeito a cada tentativa: depois de renovar, o app nativo tem um token novo para o cabeçalho.
  const comSessao = (original: HttpRequest<unknown>) => {
    if (!ehApi) return original;
    const token = authService.tokenParaApi();
    return original.clone({
      // Na web a sessão é o cookie HttpOnly; o cabeçalho X-Requested-With é a defesa anti-CSRF da API (força o preflight de CORS).
      // O app nativo não tem cookie: manda o token guardado no aparelho.
      withCredentials: !authService.nativo,
      setHeaders: token
        ? { 'X-Requested-With': 'wyvern', Authorization: `Bearer ${token}` }
        : { 'X-Requested-With': 'wyvern' },
    });
  };

  const encerrarSessao = () => {
    // Sessão expirada de vez: sai e volta para onde o usuário estava depois do login.
    const destino = router.url;
    authService.logout();
    router.navigate(['/login'], { queryParams: { returnUrl: destino } });
  };

  return next(comSessao(req)).pipe(
    catchError((erro: unknown) => {
      if (!(ehApi && erro instanceof HttpErrorResponse && erro.status === 401)) return throwError(() => erro);

      if (!podeRenovar) return throwError(() => erro);

      // O access token dura minutos: um 401 quase sempre é só ele vencido. Renova uma vez e repete a requisição.
      return from(authService.renovarSessao()).pipe(
        switchMap(resultado => {
          if (resultado === 'ok') {
            // Se ainda der 401 com a sessão recém-renovada, é de verdade: sai (sem tentar renovar de novo).
            return next(comSessao(req)).pipe(
              catchError((erro2: unknown) => {
                if (!ehAuth && erro2 instanceof HttpErrorResponse && erro2.status === 401) encerrarSessao();
                return throwError(() => erro2);
              })
            );
          }
          if (resultado === 'expirada' && !ehAuth) encerrarSessao();
          return throwError(() => erro);
        })
      );
    })
  );
};
