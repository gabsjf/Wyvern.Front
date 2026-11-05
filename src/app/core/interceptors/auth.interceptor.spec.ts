import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environments';

const USUARIO = { usuarioId: 7, nome: 'Aria', email: 'aria@teste.com', papel: 'Jogador' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
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

  it('na web a sessão vai pelo cookie: credenciais ligadas, cabeçalho anti-CSRF e nenhum Authorization', () => {
    http.get(`${environment.apiUrl}/Campanha`).subscribe();

    const req = controller.expectOne(`${environment.apiUrl}/Campanha`);
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-Requested-With')).toBe('wyvern');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('não manda cookie nem cabeçalhos da API para outras origens', () => {
    http.get('https://cdn.exemplo.com/lib.js').subscribe();

    const req = controller.expectOne('https://cdn.exemplo.com/lib.js');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-Requested-With')).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
  });

  it('no app nativo manda o token como Bearer, sem cookie', () => {
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'nativo', 'get').mockReturnValue(true);
    vi.spyOn(auth, 'tokenParaApi').mockReturnValue('abc');

    http.get(`${environment.apiUrl}/Campanha`).subscribe();

    const req = controller.expectOne(`${environment.apiUrl}/Campanha`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    expect(req.request.withCredentials).toBe(false);
    req.flush([]);
  });

  it('401 da API faz logout e volta ao login guardando a página atual', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({}).subscribe();
    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush(USUARIO);
    expect(auth.isLoggedIn()).toBe(true);

    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/campaigns/3' } });
    // o logout também avisa o servidor, que apaga o cookie
    controller.expectOne(`${environment.apiUrl}/Auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('401 no login (credencial errada) não redireciona', () => {
    http.post(`${environment.apiUrl}/Auth/login`, {}).subscribe({ error: () => {} });

    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('AuthService', () => {
  let auth: AuthService;
  let controller: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('começa sem sessão', () => {
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.usuarioLogado()).toBeNull();
  });

  it('carregarSessao pergunta à API quem está logado e guarda o usuário só em memória', async () => {
    const carregando = auth.carregarSessao();
    controller.expectOne(`${environment.apiUrl}/Auth/me`).flush(USUARIO);
    await carregando;

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.usuarioLogado()?.usuarioId).toBe(7);
    expect(localStorage.length).toBe(0);
  });

  it('carregarSessao sem sessão (401) deixa deslogado', async () => {
    const carregando = auth.carregarSessao();
    controller.expectOne(`${environment.apiUrl}/Auth/me`).flush('', { status: 401, statusText: 'Unauthorized' });
    await carregando;

    expect(auth.isLoggedIn()).toBe(false);
  });

  it('carregarSessao apaga o token e o id que versões antigas guardavam no localStorage', async () => {
    localStorage.setItem('token', 'antigo');
    localStorage.setItem('usuarioId', '3');
    localStorage.setItem('papel', 'Mestre');

    const carregando = auth.carregarSessao();
    controller.expectOne(`${environment.apiUrl}/Auth/me`).flush('', { status: 401, statusText: 'Unauthorized' });
    await carregando;

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('usuarioId')).toBeNull();
    expect(localStorage.getItem('papel')).toBeNull();
  });

  it('login guarda o usuário em memória e nada no localStorage', () => {
    auth.login({ email: 'a@b.com', senha: 'x' }).subscribe();
    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush(USUARIO);

    expect(auth.isLoggedIn()).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('logout encerra a sessão e avisa o servidor para apagar o cookie', () => {
    auth.login({}).subscribe();
    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush(USUARIO);

    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    const req = controller.expectOne(`${environment.apiUrl}/Auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('na web a conexão SignalR usa o cookie, sem token na URL', () => {
    expect(auth.opcoesDoHub()).toEqual({ withCredentials: true });
  });
});
