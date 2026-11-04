import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let servico: ConfirmService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servico = TestBed.inject(ConfirmService);
  });

  it('fica aberta até alguém responder e devolve a resposta', async () => {
    const promessa = servico.confirmar({ titulo: 'Excluir', mensagem: 'Certeza?' });
    expect(servico.aberta()?.titulo).toBe('Excluir');

    servico.responder(true);

    expect(await promessa).toBe(true);
    expect(servico.aberta()).toBeNull();
  });

  it('cancelar devolve false', async () => {
    const promessa = servico.confirmar({ titulo: 'Excluir', mensagem: 'Certeza?', perigo: true });

    servico.responder(false);

    expect(await promessa).toBe(false);
  });

  it('abrir uma nova pergunta responde "não" à anterior', async () => {
    const primeira = servico.confirmar({ titulo: 'A', mensagem: 'a' });
    const segunda = servico.confirmar({ titulo: 'B', mensagem: 'b' });

    expect(await primeira).toBe(false);
    expect(servico.aberta()?.titulo).toBe('B');

    servico.responder(true);
    expect(await segunda).toBe(true);
  });

  it('responder sem pergunta aberta não faz nada', () => {
    expect(() => servico.responder(true)).not.toThrow();
  });
});
