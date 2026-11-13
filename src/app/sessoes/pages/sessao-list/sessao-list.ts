import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PaginaDeSessoes, SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { PapelService } from '../../../campaigns/services/papel.service';
import { Paginacao } from '../../../shared/ui/paginacao/paginacao';
import { paginaDaUrl } from '../../../shared/models/pagina';

@Component({
  selector: 'app-sessao-list',
  imports: [CommonModule, RouterModule, Paginacao],
  templateUrl: './sessao-list.html',
  styleUrl: './sessao-list.scss',
})
export class SessaoList implements OnInit {
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  private papelService = inject(PapelService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** A página atual, já na ordem do servidor: por campanha e, nela, da mais nova para a mais antiga. */
  pagina: PaginaDeSessoes | null = null;
  campanhaFiltro: number | null = null;
  carregando = true;
  erro = false;
  // Só quem é Mestre de alguma campanha pode criar sessões (o servidor valida por campanha)
  podeCriarSessao = false;
  private pedido = 0;

  ngOnInit() {
    // Campanha e página ficam na URL: voltar de uma sessão devolve a mesma lista.
    const q = this.route.snapshot.queryParamMap;
    const campanha = Number(q.get('campanha'));
    this.campanhaFiltro = Number.isInteger(campanha) && campanha > 0 ? campanha : null;
    this.loadSessoes(paginaDaUrl(q.get('pagina')));

    this.papelService.ehMestreEmAlguma().subscribe({
      next: (ehMestre) => {
        this.podeCriarSessao = ehMestre;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
  }

  /** Sessões registradas que batem com o filtro (não só as da página). */
  get total(): number {
    return this.pagina?.total ?? 0;
  }

  /** Quantas sessões cada campanha tem ao todo (o rótulo do grupo mostra o total, não só o da página). */
  totalDaCampanha(campanhaId: number): number {
    return this.pagina?.porCampanha.find(c => c.campanhaId === campanhaId)?.total ?? 0;
  }

  /**
   * As sessões da página agrupadas por campanha. O servidor já manda na ordem certa, então um grupo
   * pode continuar na página seguinte; o primeiro item só é "Mais recente" se for o primeiro da campanha.
   */
  get porCampanha(): { campanhaId: number; nome: string; sessoes: Sessao[]; continuacao: boolean }[] {
    const grupos: { campanhaId: number; nome: string; sessoes: Sessao[]; continuacao: boolean }[] = [];
    const itens = this.pagina?.itens ?? [];
    for (const s of itens) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.campanhaId === s.campanhaId) ultimo.sessoes.push(s);
      else grupos.push({ campanhaId: s.campanhaId, nome: s.campanha?.nome || 'Campanha', sessoes: [s], continuacao: false });
    }
    // Só o primeiro grupo pode ter começado numa página anterior: acontece quando a campanha começa antes do início desta página.
    const primeiro = grupos[0];
    const p = this.pagina;
    if (primeiro && p) primeiro.continuacao = this.inicioDaCampanha(primeiro.campanhaId) < (p.pagina - 1) * p.tamanhoPagina;
    return grupos;
  }

  /**
   * Em que posição da lista inteira começa a campanha. `porCampanha` vem do servidor na mesma ordem das sessões,
   * então é a soma das campanhas que vêm antes dela (com filtro, só existe a campanha filtrada).
   */
  private inicioDaCampanha(campanhaId: number): number {
    if (this.campanhaFiltro !== null) return 0;
    let inicio = 0;
    for (const c of this.pagina?.porCampanha ?? []) {
      if (c.campanhaId === campanhaId) break;
      inicio += c.total;
    }
    return inicio;
  }

  /** Agendada para o futuro? (as demais já aconteceram ou estão sem data marcada) */
  agendada(s: Sessao): boolean {
    return !!s.dataAgendada && +new Date(s.dataAgendada) > Date.now();
  }

  alternarCampanha(id: number) {
    this.campanhaFiltro = this.campanhaFiltro === id ? null : id;
    this.loadSessoes(1);
  }

  irPara(pagina: number) {
    this.loadSessoes(pagina);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  loadSessoes(pagina = this.pagina?.pagina ?? 1) {
    const meu = ++this.pedido;
    this.carregando = true;
    this.erro = false;
    this.sessaoService.getPagina(pagina, this.campanhaFiltro).subscribe({
      next: (res) => {
        if (meu !== this.pedido) return;
        if (res.itens.length === 0 && res.pagina > 1 && res.totalPaginas > 0) {
          this.loadSessoes(res.totalPaginas);
          return;
        }
        this.pagina = res;
        this.carregando = false;
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { campanha: this.campanhaFiltro, pagina: res.pagina > 1 ? res.pagina : null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (meu !== this.pedido) return;
        console.error('Erro ao buscar sessões', err);
        this.erro = true;
        this.carregando = false;
        this.cdr.detectChanges();
      }
    });
  }
}
