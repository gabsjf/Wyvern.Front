import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { Campaign } from '../../models/campaign';
import { Anotacoes } from '../../../sessoes/pages/play-session/anotacoes/anotacoes';

const CHAVE_ULTIMA_CAMPANHA = 'wyvern.anotacoes.ultimaCampanha';

/**
 * O caderno de anotações fora da mesa de jogo: o Mestre prepara a sessão (roteiro, segredos, NPCs)
 * sem precisar abrir o "Jogar". É o mesmo componente da aba Anotações, com um seletor de campanha.
 */
@Component({
  selector: 'app-anotacoes-pagina',
  imports: [RouterLink, Anotacoes],
  templateUrl: './anotacoes-pagina.html',
  styleUrl: './anotacoes-pagina.scss',
})
export class AnotacoesPagina implements OnInit {
  private campanhas = inject(CampaignService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly lista = signal<Campaign[]>([]);
  readonly campanhaId = signal<number | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  readonly campanha = computed(() => this.lista().find(c => c.campanhaId === this.campanhaId()) ?? null);

  ngOnInit() {
    this.campanhas.getAll().subscribe({
      next: lista => {
        // as mais recentes primeiro
        const ordenadas = [...lista].sort((a, b) => (b.campanhaId ?? 0) - (a.campanhaId ?? 0));
        this.lista.set(ordenadas);
        this.campanhaId.set(escolherCampanha(ordenadas, Number(this.route.snapshot.queryParamMap.get('campanha')), lerUltima()));
        this.carregando.set(false);
        this.guardar();
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  trocar(id: number) {
    if (!id || id === this.campanhaId()) return;
    this.campanhaId.set(id);
    this.guardar();
  }

  /** A campanha escolhida fica na URL (dá para mandar o link) e é lembrada para a próxima vez. */
  private guardar() {
    const id = this.campanhaId();
    if (id === null) return;
    try { localStorage.setItem(CHAVE_ULTIMA_CAMPANHA, String(id)); } catch { /* só não lembra */ }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { campanha: id }, replaceUrl: true });
  }
}

function lerUltima(): number {
  try { return Number(localStorage.getItem(CHAVE_ULTIMA_CAMPANHA)); } catch { return 0; }
}

/**
 * Qual campanha abrir: a do link, se a pessoa participa dela; senão a última aberta aqui;
 * senão a mais recente em que é Mestre; senão a mais recente de todas.
 */
export function escolherCampanha(lista: Campaign[], daUrl: number, ultima: number): number | null {
  const existe = (id: number) => id > 0 && lista.some(c => c.campanhaId === id);
  if (existe(daUrl)) return daUrl;
  if (existe(ultima)) return ultima;
  return (lista.find(c => c.papel === 'Mestre') ?? lista[0])?.campanhaId ?? null;
}
