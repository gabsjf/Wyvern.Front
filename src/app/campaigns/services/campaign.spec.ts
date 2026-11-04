import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CampaignService } from './campaign';
import { environment } from '../../../environments/environments';

describe('CampaignService convites', () => {
  let service: CampaignService;
  let controller: HttpTestingController;
  const base = `${environment.apiUrl}/Campanha`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CampaignService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('gerar convite não envia "renovar" por padrão (link estável)', () => {
    service.generateInvite(7).subscribe();

    const req = controller.expectOne(r => r.url === `${base}/7/generate-invite`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.has('renovar')).toBe(false);
    req.flush({ token: 'abc' });
  });

  it('renovar convite envia renovar=true', () => {
    service.generateInvite(7, true).subscribe();

    const req = controller.expectOne(r => r.url === `${base}/7/generate-invite`);
    expect(req.request.params.get('renovar')).toBe('true');
    req.flush({ token: 'novo' });
  });

  it('revogar convite chama DELETE /invite', () => {
    service.revokeInvite(7).subscribe();

    const req = controller.expectOne(`${base}/7/invite`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('entrar usa o token do link', () => {
    service.join('xyz').subscribe();

    const req = controller.expectOne(`${base}/join/xyz`);
    expect(req.request.method).toBe('POST');
    req.flush({ campanhaId: 1 });
  });
});
