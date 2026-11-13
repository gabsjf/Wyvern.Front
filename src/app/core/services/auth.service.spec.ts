import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environments';

const API = `${environment.apiUrl}/Auth`;

describe('AuthService (detalhes da sessão)', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function entrar(resposta: object) {
    const login = firstValueFrom(auth.login({ email: 'ana@x.com', senha: 'x' }));
    http.expectOne(`${API}/login`).flush(resposta);
    await login;
  }

  it('resposta antiga sem foto nem permissão de campanha ganha os valores padrão, e o papel da conta é ignorado (WYV-09)', async () => {
    await entrar({ usuarioId: 1, nome: 'Ana', email: 'ana@x.com', papel: 'Mestre' });
    expect(auth.usuarioLogado()).toEqual({ usuarioId: 1, nome: 'Ana', email: 'ana@x.com', fotoVersao: 0, podeCriarCampanha: true });
  });

  it('o token que vier no corpo do login não fica guardado no usuário', async () => {
    await entrar({ usuarioId: 1, nome: 'Ana', email: 'ana@x.com', token: 'segredo', refreshToken: 'r' });
    expect(JSON.stringify(auth.usuarioLogado())).not.toContain('segredo');
    expect(auth.tokenParaApi()).toBeNull(); // na web a sessão é o cookie
  });

  it('atualizarUsuario reflete na hora o nome e a foto novos', async () => {
    await entrar({ usuarioId: 1, nome: 'Ana', email: 'ana@x.com', fotoVersao: 1 });
    auth.atualizarUsuario({ nome: 'Ana Tempestade', fotoVersao: 2 });
    expect(auth.usuarioLogado()).toMatchObject({ usuarioId: 1, nome: 'Ana Tempestade', fotoVersao: 2 });
  });

  it('atualizarUsuario sem sessão não cria um usuário', () => {
    auth.atualizarUsuario({ nome: 'Fantasma' });
    expect(auth.usuarioLogado()).toBeNull();
  });

  it('logout sem sessão não chama o servidor', () => {
    auth.logout();
    http.expectNone(`${API}/logout`);
  });

  it('cadastro, esqueci a senha e reenvio não abrem sessão', async () => {
    const cadastro = firstValueFrom(auth.register({ nome: 'Ana' }));
    http.expectOne(`${API}/register`).flush({ message: 'ok' });
    await cadastro;
    const esqueci = firstValueFrom(auth.esqueciSenha('ana@x.com'));
    http.expectOne(`${API}/esqueci-senha`).flush({ message: 'ok' });
    await esqueci;
    const reenvio = firstValueFrom(auth.reenviarConfirmacao('ana@x.com'));
    const req = http.expectOne(`${API}/reenviar-confirmacao`);
    expect(req.request.body).toEqual({ email: 'ana@x.com' });
    req.flush({ message: 'ok' });
    await reenvio;

    expect(auth.isLoggedIn()).toBe(false);
  });

  it('renovar a sessão logo depois de outra aba renovar não gasta o refresh token de novo', async () => {
    localStorage.setItem('wyvern_renovado_em', String(Date.now()));
    expect(await auth.renovarSessao()).toBe('ok');
    http.expectNone(`${API}/refresh`);
  });
});
