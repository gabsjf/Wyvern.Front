import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CampaignService } from './campaign';

export type PapelCampanha = 'Mestre' | 'Jogador';

/**
 * O papel (Mestre ou Jogador) é definido por campanha: a mesma pessoa pode ser Mestre numa e Jogador noutra.
 * A fonte da verdade é o campo `papel` que a API devolve em cada campanha; o servidor continua
 * validando toda ação, então isto serve apenas para mostrar ou esconder botões.
 */
@Injectable({ providedIn: 'root' })
export class PapelService {
  private campaigns = inject(CampaignService);

  /** Papel do usuário na campanha, ou null se não participa dela. */
  papelNaCampanha(campanhaId: number): Observable<PapelCampanha | null> {
    return this.campaigns.getAll().pipe(
      map(lista => (lista.find(c => c.campanhaId === campanhaId)?.papel as PapelCampanha | undefined) ?? null)
    );
  }

  /** Verdadeiro se o usuário é Mestre em pelo menos uma campanha (ex.: para mostrar "Nova Sessão"). */
  ehMestreEmAlguma(): Observable<boolean> {
    return this.campaigns.getAll().pipe(map(lista => lista.some(c => c.papel === 'Mestre')));
  }
}
