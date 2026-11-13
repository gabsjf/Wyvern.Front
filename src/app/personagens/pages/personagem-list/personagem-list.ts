import { Component, DestroyRef, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PaginaDePersonagens, PersonagemService } from '../../services/personagem.service';
import { Paginacao } from '../../../shared/ui/paginacao/paginacao';
import { paginaDaUrl } from '../../../shared/models/pagina';
import { Personagem } from '../../models/personagem';
import { PapelService } from '../../../campaigns/services/papel.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Emblema } from '../../../shared/ui/emblema/emblema';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Campaign } from '../../../campaigns/models/campaign';
import { AuthService } from '../../../core/services/auth.service';

const ESPERA_DA_BUSCA_MS = 300;

@Component({
  selector: 'app-personagem-list',
  imports: [CommonModule, FormsModule, RouterModule, Emblema, Paginacao],
  templateUrl: './personagem-list.html',
  styleUrl: './personagem-list.scss',
})
export class PersonagemList implements OnInit {
  private personagemService = inject(PersonagemService);
  private cdr = inject(ChangeDetectorRef);
  private papelService = inject(PapelService);
  private campaignService = inject(CampaignService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private readonly meuId = inject(AuthService).usuarioLogado()?.usuarioId ?? 0;
  private nomesCampanha = new Map<number, string>();
  activeTab: string = 'herois';

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.esperaDaBusca));
  }
  // A aba de NPCs/monstros só aparece para quem é Mestre de alguma campanha
  ehMestreEmAlguma = false;


  /** Campanhas em que o usuário é Mestre: os destinos possíveis de uma cópia. */
  campanhasDoMestre: Campaign[] = [];

  // ----- duplicar (biblioteca de criaturas) -----
  duplicando: Personagem | null = null;
  destinoId: number | null = null;
  nomeCopia = '';
  duplicandoAgora = false;

  abrirDuplicar(personagem: Personagem) {
    this.duplicando = personagem;
    // por padrão a cópia fica na mesma campanha, se o usuário for Mestre dela
    const mesma = this.campanhasDoMestre.find(c => c.campanhaId === personagem.campanhaId);
    this.destinoId = (mesma ?? this.campanhasDoMestre[0])?.campanhaId ?? null;
    this.nomeCopia = '';
  }

  fecharDuplicar() {
    if (!this.duplicandoAgora) this.duplicando = null;
  }

  confirmarDuplicar() {
    const original = this.duplicando;
    if (!original?.personagemId || this.destinoId === null || this.duplicandoAgora) return;

    this.duplicandoAgora = true;
    this.personagemService.duplicar(original.personagemId, { campanhaId: this.destinoId, nome: this.nomeCopia.trim() || undefined }).subscribe({
      next: copia => {
        this.duplicandoAgora = false;
        this.duplicando = null;
        this.toast.ok(`“${copia.nome}” foi adicionado à campanha ${this.nomeDaCampanha(copia.campanhaId)}.`);
        this.loadPersonagens();
      },
      error: err => {
        this.duplicandoAgora = false;
        this.toast.erro(err.error?.detail || 'Não foi possível duplicar o personagem.');
        this.cdr.detectChanges();
      },
    });
  }

  busca = '';
  campanhaFiltro: number | null = null;

  /** A página atual, já filtrada e ordenada pelo servidor (por campanha e, nela, por nome). */
  pagina: PaginaDePersonagens | null = null;
  carregando = true;
  erro = false;
  private esperaDaBusca: ReturnType<typeof setTimeout> | undefined;
  private pedido = 0;

  /** Os personagens desta página. A busca olha nome, descrição, campanha e dono (no servidor). */
  get filteredPersonagens(): Personagem[] {
    return this.pagina?.itens ?? [];
  }

  /** Campanhas que têm personagens na aba atual (para os filtros), com quantos cada uma tem. */
  get campanhasDosPersonagens(): { id: number; nome: string; total: number }[] {
    return (this.pagina?.porCampanha ?? []).map(c => ({ id: c.campanhaId, nome: c.nome, total: c.total }));
  }

  ehMeu(p: Personagem): boolean {
    return p.criadoPorId === this.meuId;
  }

  /** De quem é: "Você" no que é seu; senão o nome de quem criou (o jogador, ou o Mestre nos NPCs e monstros). */
  donoDe(p: Personagem): string {
    if (this.ehMeu(p)) return p.tipoId === 1 ? 'Seu personagem' : 'Criado por você';
    const nome = p.criadoPorNome?.trim();
    if (!nome) return p.tipoId === 1 ? 'Jogador desconhecido' : 'Criado pelo Mestre';
    return p.tipoId === 1 ? nome : `Criado por ${nome}`;
  }

  contar(aba: 'herois' | 'monstros'): number {
    return (aba === 'herois' ? this.pagina?.totalHerois : this.pagina?.totalMonstros) ?? 0;
  }

  rotuloTipo(p: Personagem): string {
    return p.tipoId === 1 ? 'Herói' : p.tipoId === 2 ? 'NPC' : 'Monstro';
  }

  alternarCampanha(id: number) {
    this.campanhaFiltro = this.campanhaFiltro === id ? null : id;
    this.loadPersonagens(1);
  }

  setTab(tab: string) {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    // cada aba tem as suas campanhas: o filtro da outra não vale aqui
    this.campanhaFiltro = null;
    this.loadPersonagens(1);
  }

  buscar(texto: string) {
    this.busca = texto;
    clearTimeout(this.esperaDaBusca);
    this.esperaDaBusca = setTimeout(() => this.loadPersonagens(1), ESPERA_DA_BUSCA_MS);
  }

  irPara(pagina: number) {
    this.loadPersonagens(pagina);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  /** Nome da campanha: o que veio com o personagem ou, se faltar, o da lista de campanhas. */
  nomeDaCampanha(alvo: number | Personagem): string {
    if (typeof alvo !== 'number' && alvo.campanhaNome) return alvo.campanhaNome;
    const id = typeof alvo === 'number' ? alvo : alvo.campanhaId;
    return this.nomesCampanha.get(id) ?? 'Campanha';
  }

  ngOnInit() {
    // Aba, busca, campanha e página ficam na URL: voltar de uma ficha devolve a mesma lista.
    const q = this.route.snapshot.queryParamMap;
    this.activeTab = q.get('aba') === 'monstros' ? 'monstros' : 'herois';
    this.busca = q.get('busca') ?? '';
    const campanha = Number(q.get('campanha'));
    this.campanhaFiltro = Number.isInteger(campanha) && campanha > 0 ? campanha : null;
    this.loadPersonagens(paginaDaUrl(q.get('pagina')));
    this.campaignService.getAll().subscribe({
      next: (lista) => {
        lista.forEach(c => this.nomesCampanha.set(c.campanhaId!, c.nome));
        this.campanhasDoMestre = lista.filter(c => c.papel === 'Mestre');
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
    this.papelService.ehMestreEmAlguma().subscribe({
      next: (ehMestre) => {
        this.ehMestreEmAlguma = ehMestre;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas', err)
    });
  }

  /** Carrega uma página da aba atual com a busca e o filtro. Sem número, recarrega a página em que está. */
  loadPersonagens(pagina = this.pagina?.pagina ?? 1) {
    const meu = ++this.pedido; // só a última resposta vale (busca digitada rápido)
    this.carregando = true;
    this.erro = false;
    const tipo = this.activeTab === 'herois' ? 'herois' : 'monstros';
    this.personagemService.getPagina({ pagina, tipo, busca: this.busca, campanhaId: this.campanhaFiltro }).subscribe({
      next: (res) => {
        if (meu !== this.pedido) return;
        // a página pedida deixou de existir (personagens apagados): volta para a última
        if (res.itens.length === 0 && res.pagina > 1 && res.totalPaginas > 0) {
          this.loadPersonagens(res.totalPaginas);
          return;
        }
        this.pagina = res;
        this.carregando = false;
        this.guardarNaUrl(res.pagina);
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (meu !== this.pedido) return;
        console.error('Erro ao buscar personagens', err);
        this.erro = true;
        this.carregando = false;
        this.cdr.detectChanges();
      }
    });
  }

  private guardarNaUrl(pagina: number) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        aba: this.activeTab === 'monstros' ? 'monstros' : null,
        busca: this.busca.trim() || null,
        campanha: this.campanhaFiltro,
        pagina: pagina > 1 ? pagina : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
