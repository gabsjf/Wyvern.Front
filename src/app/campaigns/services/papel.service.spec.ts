import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PapelService } from './papel.service';
import { environment } from '../../../environments/environments';

describe('PapelService (papel por campanha)', () => {
  let service: PapelService;
  let controller: HttpTestingController;
  const url = `${environment.apiUrl}/Campanha`;

  // A mesma pessoa: Mestre na campanha 1 e Jogador na 2
  const campanhas = [
    { campanhaId: 1, nome: 'Minha mesa', papel: 'Mestre' },
    { campanhaId: 2, nome: 'Mesa da Bia', papel: 'Jogador' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PapelService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('o papel muda de campanha para campanha', () => {
    const papeis: (string | null)[] = [];
    service.papelNaCampanha(1).subscribe(p => papeis.push(p));
    controller.expectOne(url).flush(campanhas);
    service.papelNaCampanha(2).subscribe(p => papeis.push(p));
    controller.expectOne(url).flush(campanhas);

    expect(papeis).toEqual(['Mestre', 'Jogador']);
  });

  it('campanha de que não participa não dá papel', () => {
    let papel: string | null = 'x';
    service.papelNaCampanha(99).subscribe(p => (papel = p));
    controller.expectOne(url).flush(campanhas);

    expect(papel).toBeNull();
  });

  it('ehMestreEmAlguma é verdadeiro se for Mestre em qualquer campanha', () => {
    let resultado: boolean | undefined;
    service.ehMestreEmAlguma().subscribe(r => (resultado = r));
    controller.expectOne(url).flush(campanhas);

    expect(resultado).toBe(true);
  });

  it('ehMestreEmAlguma é falso se for só Jogador', () => {
    let resultado: boolean | undefined;
    service.ehMestreEmAlguma().subscribe(r => (resultado = r));
    controller.expectOne(url).flush([campanhas[1]]);

    expect(resultado).toBe(false);
  });
});
