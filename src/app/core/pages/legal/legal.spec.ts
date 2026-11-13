import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Termos } from './termos/termos';
import { Privacidade } from './privacidade/privacidade';
import { DADOS_LEGAIS } from './dados-legais';

function renderizar(pagina: typeof Termos | typeof Privacidade): HTMLElement {
  TestBed.configureTestingModule({ imports: [pagina], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(pagina);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Páginas legais', () => {
  it('Termos mostram o título, o responsável e o link para a privacidade', () => {
    const el = renderizar(Termos);
    expect(el.querySelector('h1')?.textContent).toContain('Termos de uso');
    expect(el.textContent).toContain(DADOS_LEGAIS.responsavel);
    expect(el.querySelector('a[href="/privacidade"]')).not.toBeNull();
  });

  it('Privacidade mostra controlador, contato e o canal da ANPD', () => {
    const el = renderizar(Privacidade);
    expect(el.querySelector('h1')?.textContent).toContain('Política de privacidade');
    expect(el.textContent).toContain(DADOS_LEGAIS.encarregado);
    expect(el.querySelector(`a[href="mailto:${DADOS_LEGAIS.emailPrivacidade}"]`)).not.toBeNull();
    expect(el.querySelector('a[href="https://www.gov.br/anpd"]')).not.toBeNull();
  });

  it('as duas páginas trazem a data de atualização e o rodapé com os dois documentos', () => {
    for (const pagina of [Termos, Privacidade]) {
      TestBed.resetTestingModule();
      const el = renderizar(pagina);
      expect(el.textContent).toContain(DADOS_LEGAIS.atualizadoEm);
      expect(el.querySelector('footer a[href="/termos"]')).not.toBeNull();
      expect(el.querySelector('footer a[href="/privacidade"]')).not.toBeNull();
    }
  });
});
