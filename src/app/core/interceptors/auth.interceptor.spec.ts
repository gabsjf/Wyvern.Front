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
    localStorage.clear(); // o carimbo de "outra aba renovou agora" não pode vazar de um teste para o outro
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

  it('no app nativo a conexão SignalR pede um ticket novo à API em vez de levar o token da sessão na URL', async () => {
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'nativo', 'get').mockReturnValue(true);
    vi.spyOn(auth, 'tokenParaApi').mockReturnValue('sessao-longa');

    const opcoes = auth.opcoesDoHub();
    expect(opcoes.withCredentials).toBeUndefined();

    const pedido = (opcoes.accessTokenFactory as () => Promise<string>)();
    const req = controller.expectOne(`${environment.apiUrl}/Auth/hub-ticket`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer sessao-longa');
    req.flush({ ticket: 'ticket-curto' });

    expect(await pedido).toBe('ticket-curto');
  });

  const NAO_AUTORIZADO = { status: 401, statusText: 'Unauthorized' };
  const tick = () => new Promise<void>(resolver => setTimeout(resolver));

  it('401 da API com refresh recusado faz logout e volta ao login guardando a página atual', async () => {
    const auth = TestBed.inject(AuthService);
    auth.login({}).subscribe();
    controller.expectOne(`${environment.apiUrl}/Auth/login`).flush(USUARIO);
    expect(auth.isLoggedIn()).toBe(true);

    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    await tick();
    // antes de desistir, tenta renovar a sessão; o servidor recusa
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush('', NAO_AUTORIZADO);
    await tick();

    expect(auth.isLoggedIn()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/campaigns/3' } });
    // o logout também avisa o servidor, que apaga o cookie
    controller.expectOne(`${environment.apiUrl}/Auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('401 por access token vencido: renova a sessão e repete a requisição sem deslogar', async () => {
    const auth = TestBed.inject(AuthService);
    const resultado: unknown[] = [];

    http.get(`${environment.apiUrl}/Campanha`).subscribe(r => resultado.push(r));
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush(USUARIO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush([{ campanhaId: 1 }]);

    expect(resultado).toEqual([[{ campanhaId: 1 }]]);
    expect(auth.isLoggedIn()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('várias requisições com 401 ao mesmo tempo dividem uma só troca de refresh token', async () => {
    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: () => {} });
    http.get(`${environment.apiUrl}/Personagem`).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    controller.expectOne(`${environment.apiUrl}/Personagem`).flush('', NAO_AUTORIZADO);
    await tick();

    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush(USUARIO);
    await tick();

    controller.expectOne(`${environment.apiUrl}/Campanha`).flush([]);
    controller.expectOne(`${environment.apiUrl}/Personagem`).flush([]);
  });

  it('se a requisição ainda dá 401 com a sessão recém-renovada, faz logout (sem renovar de novo)', async () => {
    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush(USUARIO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    await tick();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/campaigns/3' } });
    controller.expectNone(`${environment.apiUrl}/Auth/refresh`);
    controller.expectOne(`${environment.apiUrl}/Auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('servidor fora do ar na hora de renovar não desloga o usuário', async () => {
    const erros: unknown[] = [];
    http.get(`${environment.apiUrl}/Campanha`).subscribe({ error: e => erros.push(e) });
    controller.expectOne(`${environment.apiUrl}/Campanha`).flush('', NAO_AUTORIZADO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush('', { status: 503, statusText: 'Unavailable' });
    await tick();

    expect(erros.length).toBe(1);
    expect(router.navigate).not.toHaveBeenCalled();
    controller.expectNone(`${environment.apiUrl}/Auth/logout`);
  });

  it('/Auth/me sem sessão tenta renovar, mas não redireciona para o login (é só a checagem inicial)', async () => {
    http.get(`${environment.apiUrl}/Auth/me`).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Auth/me`).flush('', NAO_AUTORIZADO);
    await tick();
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush('', NAO_AUTORIZADO);
    await tick();

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401 no refresh em si não dispara outra renovação', async () => {
    http.post(`${environment.apiUrl}/Auth/refresh`, null).subscribe({ error: () => {} });
    controller.expectOne(`${environment.apiUrl}/Auth/refresh`).flush('', NAO_AUTORIZADO);
    await tick();

    controller.expectNone(`${environment.apiUrl}/Auth/refresh`);
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
