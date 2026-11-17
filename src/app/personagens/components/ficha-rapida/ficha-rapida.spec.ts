import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { FichaRapida } from './ficha-rapida';
import { PersonagemService } from '../../services/personagem.service';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

function heroi() {
  return {
    personagemId: 7,
    nome: 'Lyra',
    atributo: { forca: 16, destreza: 14 },
    personagemCombate: { vidaMaxima: 20, vidaAtual: 12, vidaTemporaria: 0, classeArmadura: 16, proficienciaBonus: 2, condicoes: 'Envenenado' },
    personagemAtaques: [{ personagemAtaqueId: 1, nome: 'Espada longa', atributoBase: 'Forca', proficiente: true, bonusAcerto: 0, dano: '1d8' }],
    personagemConjuracao: { atributoConjuracao: 'Nenhum', slotsNivel1Max: 2, slotsNivel1Atual: 2 },
  };
}

describe('FichaRapida', () => {
  let fixture: ComponentFixture<FichaRapida>;
  let component: FichaRapida;
  const mesa = { rolar: vi.fn(async (_r: string, formula: string) => ({ formula, total: 17, dados: [11] })) };
  const personagens = { atualizarEstado: vi.fn(() => of({})), getById: vi.fn(() => of(heroi())) };

  beforeEach(async () => {
    mesa.rolar.mockClear();
    personagens.atualizarEstado.mockClear();
    await TestBed.configureTestingModule({
      imports: [FichaRapida],
      providers: [
        provideRouter([]),
        { provide: MesaService, useValue: mesa },
        { provide: PersonagemService, useValue: personagens },
        { provide: ToastService, useValue: { erro: vi.fn(), info: vi.fn(), ok: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaRapida);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('personagem', heroi());
    fixture.detectChanges();
  });

  it('mostra PV, CA e as condições sem abrir nada', () => {
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('12/20');
    expect(texto).toContain('16');
    expect(texto).toContain('Envenenado');
  });

  it('rola o ataque na mesa com o bônus calculado e mostra o resultado ali mesmo', async () => {
    const x = component.ataques()[0];
    component.rolarAtaque(x.ataque, x.acerto);
    await vi.waitFor(() => expect(component.ultimo()).not.toBeNull());

    expect(mesa.rolar).toHaveBeenCalledWith('Ataque: Espada longa', '1d20+5', 'Lyra');
    expect(component.ultimo()?.total).toBe(17);
  });

  it('dano aplicado na hora e gravado no servidor', () => {
    component.quantidade.set(5);
    component.aplicarDano();

    expect(component.vida().atual).toBe(7);
    expect(personagens.atualizarEstado).toHaveBeenCalledWith(7, { vidaAtual: 7, vidaTemporaria: 0 });
  });

  it('gastar um espaço de magia grava todos os círculos', () => {
    component.alternarEspaco(1, 1);

    expect(component.espacos()[0].atual).toBe(1);
    expect(personagens.atualizarEstado).toHaveBeenCalledWith(7, { espacosAtuais: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
  });
});
