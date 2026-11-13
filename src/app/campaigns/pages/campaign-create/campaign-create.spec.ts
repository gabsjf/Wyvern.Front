import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CampaignCreate } from './campaign-create';
import { AuthService } from '../../../core/services/auth.service';

describe('CampaignCreate', () => {
  let component: CampaignCreate;
  let fixture: ComponentFixture<CampaignCreate>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignCreate);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AuthService), 'carregarSessao').mockResolvedValue(undefined as never);
    await fixture.whenStable();
  });

  it('só libera o envio com nome e sistema', () => {
    expect(component.podeSalvar()).toBe(false);
    component.nome.set('  A Queda de Vael ');
    expect(component.podeSalvar()).toBe(false);
    component.escolherSistema('Tormenta20');
    expect(component.podeSalvar()).toBe(true);
  });

  it('"Outro sistema" troca o sistema sugerido pelo texto digitado', () => {
    component.escolherSistema('D&D 5e');
    component.escolherOutro();
    expect(component.sistema()).toBe('');
    component.sistemaLivre.set(' Mörk Borg ');
    expect(component.sistema()).toBe('Mörk Borg');
    component.escolherSistema('D&D 5e');
    expect(component.sistema()).toBe('D&D 5e');
  });

  it('sortear nunca repete o nome anterior', () => {
    for (let i = 0; i < 20; i++) {
      const antes = component.nome();
      component.sortearNome();
      expect(component.nome()).not.toBe(antes);
      expect(component.nome().length).toBeGreaterThan(0);
    }
  });

  it('envia nome e sistema limpos e abre a campanha criada', () => {
    component.nome.set('  A Queda de Vael ');
    component.escolherSistema('Tormenta20');
    component.save();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/Campanha'));
    expect(req.request.body).toEqual({ nome: 'A Queda de Vael', sistema: 'Tormenta20', ativo: true });
    req.flush({ campanhaId: 42, nome: 'A Queda de Vael' });

    expect(router.navigate).toHaveBeenCalledWith(['/campaigns', 42]);
  });

  it('mostra o motivo do 403 e o link do plano', () => {
    component.nome.set('Nova');
    component.escolherSistema('D&D 5e');
    component.save();

    http.expectOne(r => r.method === 'POST').flush({ detail: 'Limite do plano atingido.' }, { status: 403, statusText: 'Forbidden' });

    expect(component.erro()).toBe('Limite do plano atingido.');
    expect(component.bloqueadoPeloPlano()).toBe(true);
    expect(component.salvando()).toBe(false);
  });
});
