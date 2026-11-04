import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DescansoDialog, TipoDescanso } from './descanso-dialog';

/** Nível 5, 40 PV (12 atuais), 5d10 com 3 gastos, CON 14 (+2), 4 PV temporários e espaços de magia. */
function personagem(): any {
  return {
    personagemId: 15,
    nome: 'Thorin',
    atributo: { constituicao: 14 },
    personagemPlayer: { nivel: 5 },
    personagemCombate: { vidaMaxima: 40, vidaAtual: 12, dadoVidaMaximo: '5d10', dadoVidaGasto: 3, vidaTemporaria: 4, deathSaveSucessos: 0, deathSaveFalhas: 1 },
    personagemConjuracao: { slotsNivel1Max: 3, slotsNivel1Atual: 0 },
  };
}

describe('DescansoDialog', () => {
  let fixture: ComponentFixture<DescansoDialog>;
  let dialogo: DescansoDialog;
  let http: HttpTestingController;

  function abrir(tipo: TipoDescanso) {
    fixture = TestBed.createComponent(DescansoDialog);
    fixture.componentRef.setInput('personagem', personagem());
    fixture.componentRef.setInput('tipo', tipo);
    dialogo = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    http.verify();
  });

  /** O endereço base da API muda entre ambientes; o que importa é o caminho. */
  const pedido = () => http.expectOne(r => r.url.endsWith('/Personagem/15/descanso'));

  it('descanso curto: propõe gastar 1 dado e envia a cura rolada com os campos que o servidor espera', () => {
    abrir('curto');
    expect(dialogo.quantidade).toBe(1);

    vi.spyOn(Math, 'random').mockReturnValue(0.5); // face 6 em um d10, +2 de CON = 8
    dialogo.rolar();
    expect(dialogo.cura).toBe(8);
    expect(dialogo.vidaDepois).toBe(20);

    dialogo.aplicar();
    const req = pedido();
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      tipo: 'Curto', vidaAtual: 20, vidaTemporaria: 4, dadoVidaGasto: 4,
      deathSaveSucessos: 0, deathSaveFalhas: 0, restaurarEspacosMagia: false,
    });
    req.flush({});
  });

  it('descanso curto manual: usa o total digitado e os dados informados, sem sortear nada', () => {
    abrir('curto');
    dialogo.trocarModo('manual');
    dialogo.quantidade = 2;
    dialogo.curaManual = 17;

    dialogo.aplicar();
    const req = pedido();
    expect(req.request.body).toMatchObject({ tipo: 'Curto', vidaAtual: 29, dadoVidaGasto: 5 });
    req.flush({});
  });

  it('a cura manual não passa do máximo de PV', () => {
    abrir('curto');
    dialogo.trocarModo('manual');
    dialogo.curaManual = 500;

    expect(dialogo.vidaDepois).toBe(40);
  });

  it('descanso longo pelas regras: tudo restaurado e metade dos dados de vida de volta', () => {
    abrir('longo');

    dialogo.aplicar();
    const req = pedido();
    expect(req.request.body).toEqual({
      tipo: 'Longo', vidaAtual: 40, vidaTemporaria: 0, dadoVidaGasto: 1,
      deathSaveSucessos: 0, deathSaveFalhas: 0, restaurarEspacosMagia: true,
    });
    req.flush({});
  });

  it('descanso longo manual: envia o que foi editado e recusa valores fora dos limites', () => {
    abrir('longo');
    dialogo.trocarModo('manual');

    dialogo.longo.vidaAtual = 41;
    expect(dialogo.longoErro).toContain('entre 0 e 40');
    expect(dialogo.podeAplicar).toBe(false);

    dialogo.longo.vidaAtual = 30;
    dialogo.longo.dadoVidaGasto = 2;
    expect(dialogo.longoErro).toBe('');

    dialogo.aplicar();
    const req = pedido();
    expect(req.request.body).toMatchObject({ tipo: 'Longo', vidaAtual: 30, dadoVidaGasto: 2 });
    req.flush({});
  });

  it('mostra a mensagem do servidor quando o descanso é recusado', () => {
    abrir('curto');

    dialogo.aplicar();
    pedido()
      .flush({ detail: 'Os pontos de vida devem ficar entre 0 e 40.' }, { status: 400, statusText: 'Bad Request' });

    expect(dialogo.erroServidor()).toBe('Os pontos de vida devem ficar entre 0 e 40.');
    expect(dialogo.salvando()).toBe(false);
  });

  it('sem corpo de resposta, explica a falha pelo status (ex.: 404 de uma API desatualizada)', () => {
    abrir('curto');

    dialogo.aplicar();
    pedido().flush(null, { status: 404, statusText: 'Not Found' });

    expect(dialogo.erroServidor()).toContain('reinicie a API');
  });

  it('emite um resumo quando conclui', () => {
    abrir('curto');
    let resumo = '';
    dialogo.concluido.subscribe(r => (resumo = r));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    dialogo.rolar();

    dialogo.aplicar();
    pedido().flush({});

    expect(resumo).toContain('+8 PV');
    expect(resumo).toContain('1 dado de vida gasto');
  });
});
