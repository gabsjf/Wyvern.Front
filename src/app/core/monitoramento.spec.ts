import { limparTexto } from './monitoramento';

describe('monitoramento: limparTexto', () => {
  it('tira tokens de link da URL', () => {
    expect(limparTexto('https://wyvern.sbs/redefinir-senha?token=12.abc&x=1')).toBe('https://wyvern.sbs/redefinir-senha?token=[removido]&x=1');
  });

  it('tira o token de convite do caminho', () => {
    expect(limparTexto('https://wyvern.sbs/invite/0f1e2d3c?x=1')).toBe('https://wyvern.sbs/invite/[removido]?x=1');
    expect(limparTexto('/Campanha/join/abc123')).toBe('/Campanha/join/[removido]');
  });

  it('deixa URLs comuns como estão', () => {
    expect(limparTexto('/campaigns/3')).toBe('/campaigns/3');
    expect(limparTexto(undefined)).toBeUndefined();
  });
});
