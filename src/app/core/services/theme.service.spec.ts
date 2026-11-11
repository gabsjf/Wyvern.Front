import { ThemeService } from './theme.service';

/** O jsdom não tem matchMedia: simula a preferência do sistema. */
function sistema(claro: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: claro && q.includes('light') }),
  });
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sem escolha, segue o sistema e não força tema no HTML', () => {
    sistema(true);
    const tema = new ThemeService();
    expect(tema.efetivo).toBe('claro');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('alternar troca o tema, marca o HTML e lembra a escolha', () => {
    sistema(false);
    const tema = new ThemeService();
    expect(tema.efetivo).toBe('escuro');

    tema.alternar();

    expect(tema.efetivo).toBe('claro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('wyvern-tema')).toBe('claro');
  });

  it('abre com o tema que a pessoa escolheu, mesmo que o sistema diga outro', () => {
    sistema(true);
    localStorage.setItem('wyvern-tema', 'escuro');
    const tema = new ThemeService();
    expect(tema.efetivo).toBe('escuro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('valor estranho guardado vale como "seguir o sistema"', () => {
    sistema(false);
    localStorage.setItem('wyvern-tema', 'roxo');
    expect(new ThemeService().efetivo).toBe('escuro');
  });
});
