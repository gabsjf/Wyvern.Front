import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environments';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // O token só vai para a nossa API, nunca para outras origens (CDNs, assets etc.).
  const ehApi = req.url.startsWith(environment.apiUrl);
  // Em login/cadastro um 401 significa credencial errada: a própria tela mostra o erro.
  const ehAuth = req.url.startsWith(`${environment.apiUrl}/Auth/`);
  const token = authService.getToken();

  if (ehApi && token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((erro: unknown) => {
      if (ehApi && !ehAuth && erro instanceof HttpErrorResponse && erro.status === 401) {
        // Sessão expirada ou token inválido: sai e volta para onde o usuário estava depois do login.
        const destino = router.url;
        authService.logout();
        router.navigate(['/login'], { queryParams: { returnUrl: destino } });
      }
      return throwError(() => erro);
    })
  );
};
