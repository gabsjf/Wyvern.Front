import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { CampanhaNaLista } from '../../models/campaign';
import { Emblema, capaDoNome } from '../../../shared/ui/emblema/emblema';
import { Paginacao } from '../../../shared/ui/paginacao/paginacao';
import { Pagina, paginaDaUrl } from '../../../shared/models/pagina';
import { AuthService } from '../../../core/services/auth.service';

const ESPERA_DA_BUSCA_MS = 300;

@Component({
  selector: 'app-campaign-list',
  imports: [CommonModule, RouterModule, Emblema, Paginacao],
  templateUrl: './campaign-list.html',
  styleUrl: './campaign-list.scss',
})
export class CampaignList implements OnInit {
  private campaignService = inject(CampaignService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  /** Decide entre "Nova campanha", o aviso de conta Jogador e o aviso de limite do plano. */
  readonly usuario = inject(AuthService).usuarioLogado;

  readonly pagina = signal<Pagina<CampanhaNaLista> | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly busca = signal('');

  private esperaDaBusca: ReturnType<typeof setTimeout> | undefined;
  private pedido = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.esperaDaBusca));
  }

  ngOnInit(): void {
    // A página e a busca ficam na URL: voltar de uma campanha devolve a mesma página.
    const q = this.route.snapshot.queryParamMap;
    this.busca.set(q.get('busca') ?? '');
    this.carregar(paginaDaUrl(q.get('pagina')));
  }

  get campaigns(): CampanhaNaLista[] {
    return this.pagina()?.itens ?? [];
  }

  /** Total de campanhas que batem com a busca (não só as da página). */
  get total(): number {
    return this.pagina()?.total ?? 0;
  }

  /** O cartão de "Nova campanha" fica no fim da lista: na última página, ou sozinho quando não há nenhuma. */
  get mostraCartaoNovo(): boolean {
    const p = this.pagina();
    return !!p && !this.busca().trim() && p.pagina >= p.totalPaginas;
  }

  buscar(texto: string) {
    this.busca.set(texto);
    clearTimeout(this.esperaDaBusca);
    this.esperaDaBusca = setTimeout(() => this.carregar(1), ESPERA_DA_BUSCA_MS);
  }

  irPara(pagina: number) {
    this.carregar(pagina);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  carregar(pagina: number) {
    const meu = ++this.pedido; // só a última resposta vale (busca digitada rápido)
    this.carregando.set(true);
    this.erro.set(false);
    this.campaignService.getPagina(pagina, this.busca()).subscribe({
      next: res => {
        if (meu !== this.pedido) return;
        // pediu uma página que não existe mais (apagaram campanhas): volta para a última
        if (res.itens.length === 0 && res.pagina > 1 && res.totalPaginas > 0) {
          this.carregar(res.totalPaginas);
          return;
        }
        this.pagina.set(res);
        this.carregando.set(false);
        this.guardarNaUrl(res.pagina);
      },
      error: (error: unknown) => {
        if (meu !== this.pedido) return;
        console.error('Erro ao buscar campanhas:', error);
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  private guardarNaUrl(pagina: number) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pagina: pagina > 1 ? pagina : null, busca: this.busca().trim() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  capa(c: CampanhaNaLista): string {
    return capaDoNome(c.nome);
  }
}
