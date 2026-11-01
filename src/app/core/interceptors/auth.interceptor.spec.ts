import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environments';

// JWT mínimo só com o campo exp (a assinatura não é verificada no front).
function jwtComExp(expEmSegundos: number): string {
  const base64Url = (obj: object) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${base64Url({ alg: 'HS256' })}.${base64Url({ exp: expEmSegundos })}.assinatura`;
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    router = { url: '/campaigns/3', navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('envia o token para a API', () => {
    localStorage.setItem('token', 'abc');
    http.get(`${environment.apiUrl}/Campanha`).subscribe();

    const req = controller.expectOne(`${environment.apiUrl}/Campanha`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush([]);
  });

  it('não envia o token para outras origens', () => {
    localStorage.setItem('token', 'abc');
    http.get('https://cdn.exemplo.com/lib.js').subscribe();

    const req = controller.expectOne('https://cdn.exemplo.com/lib.js');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
  });

  it('401 da API faz logout e volta ao login guardando a página atual', () => {
    localStorage.setItem('token', 'abc');
    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: () => {} });

    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem('token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/campaigns/3' } });
  });

  it('401 no login (credencial errada) não redireciona', () => {
    http.post(`${environment.apiUrl}/Auth/login`, {}).subscribe({ error: () => {} });

    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('AuthService.isLoggedIn', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('false sem token', () => {
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });

  it('true com token dentro da validade', () => {
    localStorage.setItem('token', jwtComExp(Math.floor(Date.now() / 1000) + 3600));
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
  });

  it('false e limpa a sessão com token expirado', () => {
    localStorage.setItem('token', jwtComExp(Math.floor(Date.now() / 1000) - 10));
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('false com token malformado', () => {
    localStorage.setItem('token', 'nao-e-um-jwt');
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });
});
