import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let servico: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    servico = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('mostra o aviso com o tipo certo', () => {
    servico.ok('Salvo');
    servico.erro('Falhou');

    expect(servico.toasts().map(t => [t.tipo, t.mensagem])).toEqual([['ok', 'Salvo'], ['erro', 'Falhou']]);
  });

  it('sucesso some sozinho em 4 s, erro fica 8 s', () => {
    servico.ok('Salvo');
    servico.erro('Falhou');

    vi.advanceTimersByTime(4000);
    expect(servico.toasts().map(t => t.tipo)).toEqual(['erro']);

    vi.advanceTimersByTime(4000);
    expect(servico.toasts()).toEqual([]);
  });

  it('fechar remove só o aviso indicado', () => {
    servico.info('A');
    servico.info('B');
    const [primeiro] = servico.toasts();

    servico.fechar(primeiro.id);

    expect(servico.toasts().map(t => t.mensagem)).toEqual(['B']);
  });
});
