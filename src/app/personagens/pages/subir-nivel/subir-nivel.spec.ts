import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SubirNivel } from './subir-nivel';
import { ProximoNivel } from '../../models/personagem';
import { MesaService } from '../../../campaigns/services/mesa.service';

function previa(extra: Partial<ProximoNivel> = {}): ProximoNivel {
  return {
    classeReconhecida: true, classe: 'Guerreiro', nivelAtual: 3, proximoNivel: 4, nivelDisponivel: 4, podeSubir: true,
    xp: 2700, xpProximoNivel: 6500, nivelLiberado: 0, dadoVida: 10, pvFixo: 6, modConstituicao: 2, vidaMaxima: 28,
    proficiencia: { antes: 2, depois: 2 }, caracteristicas: ['Melhoria de Atributo'], recursos: [],
    escolheSubclasse: false, melhoriaDeAtributo: true, dadivaEpica: false,
    atributos: { forca: 16, destreza: 12, constituicao: 15, inteligencia: 10, sabedoria: 10, carisma: 19 },
    ...extra,
  };
}

function montar(p: ProximoNivel) {
  const rolar = vi.fn().mockResolvedValue({ total: 7 });
  TestBed.configureTestingModule({
    imports: [SubirNivel],
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '5' }) } } },
      { provide: MesaService, useValue: { rolar } },
    ],
  });
  const fixture = TestBed.createComponent(SubirNivel);
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  http.expectOne(r => r.url.endsWith('/Personagem/5')).flush({ personagemId: 5, nome: 'Thorin', campanhaId: 1, tipoId: 1 });
  http.expectOne(r => r.url.endsWith('/Personagem/5/proximo-nivel')).flush(p);
  return { c: fixture.componentInstance, http, router, rolar };
}

describe('SubirNivel', () => {
  it('PV fixo: média + CON, e a CON que sobe ajusta todos os níveis', () => {
    const { c } = montar(previa());
    expect(c.pvGanhos()).toBe(8); // 6 + 2
    c.ajustar('constituicao', 1); // 15 → 16: CON +2 → +3
    expect(c.pvGanhos()).toBe(12); // 8 + 1 × 4 níveis
  });

  it('Aprimoramento de Atributo: 2 pontos, no máximo +2 em um, nunca acima de 20', () => {
    const { c } = montar(previa());
    c.ajustar('forca', 1);
    c.ajustar('forca', 1);
    expect(c.podeAumentar('forca')).toBe(false);
    expect(c.podeAumentar('destreza')).toBe(false); // os 2 pontos já foram
    c.ajustar('forca', -1);
    expect(c.podeAumentar('carisma')).toBe(true);
    c.ajustar('carisma', 1); // 19 → 20
    c.ajustar('forca', -1);
    expect(c.podeAumentar('carisma')).toBe(false); // já está em 20
    expect(c.pendencias()).toContain('distribuir os 2 pontos de atributo');
  });

  it('rolar o dado de vida usa os dados da mesa e não deixa rolar de novo', async () => {
    const { c, rolar } = montar(previa({ melhoriaDeAtributo: false, caracteristicas: [] }));
    await c.rolarDado();
    await c.rolarDado();
    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar).toHaveBeenCalledWith('Dado de vida (nível 4)', '1d10', 'Thorin');
    expect(c.rolado()).toBe(7);
    c.escolherModo('Fixo');
    expect(c.modoPv()).toBe('Rolado');
    expect(c.pvGanhos()).toBe(9);
  });

  it('no nível 3 pede a subclasse antes de confirmar', () => {
    const { c } = montar(previa({ nivelAtual: 2, proximoNivel: 3, escolheSubclasse: true, melhoriaDeAtributo: false }));
    expect(c.podeConfirmar()).toBe(false);
    c.subclasse.set('Campeão');
    expect(c.podeConfirmar()).toBe(true);
  });

  it('envia as escolhas e volta para a ficha', () => {
    const { c, http, router } = montar(previa());
    c.escolherMelhoria('Talento');
    c.talento.set(' Sortudo ');
    c.ajustar('destreza', 1);
    expect(c.podeAumentar('forca')).toBe(false); // talento dá só +1
    c.confirmar();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/Personagem/5/subir-nivel'));
    expect(req.request.body).toEqual({ modoPv: 'Fixo', melhoria: { tipo: 'Talento', talento: 'Sortudo', aumentos: { destreza: 1 } } });
    req.flush({ nivelNovo: 4, pvGanhos: 8, resumo: '', personagem: {} });
    expect(router.navigate).toHaveBeenCalledWith(['/ficha', 5]);
  });

  it('sem nível liberado não oferece a subida', () => {
    const { c } = montar(previa({ podeSubir: false, motivo: 'O Mestre ainda não liberou o próximo nível.' }));
    expect(c.podeConfirmar()).toBe(false);
  });
});
