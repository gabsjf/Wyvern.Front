import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

function rodar(logado: boolean, url = '/campaigns/5') {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: () => logado } }],
  });
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const resultado = TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  return { resultado, navegar };
}

describe('authGuard', () => {
  it('deixa passar quem está logado', () => {
    const { resultado, navegar } = rodar(true);
    expect(resultado).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('manda para o login guardando para onde a pessoa ia', () => {
    const { resultado, navegar } = rodar(false, '/ficha/9');
    expect(resultado).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/ficha/9' } });
  });
});
