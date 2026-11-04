import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { marked } from 'marked';
import { CampaignService } from '../../services/campaign';
import { LinhaDoTempoService } from '../../services/linha-do-tempo.service';
import { Campaign } from '../../models/campaign';
import { EventoCampanha, EventoForm, SessaoResumo, TIPOS_EVENTO, TipoEvento } from '../../models/evento-campanha';
import { LayoutService } from '../../../core/layout/layout.service';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

type Modo = 'sessao' | 'mundo';
type Menu = 'filtro' | 'anterior' | null;

/** Um "capítulo" do palco: uma sessão (visão da mesa) ou uma data do mundo (visão cronológica). */
interface Grupo {
  chave: string;
  titulo: string;
  sessao?: SessaoResumo;
  eventos: EventoCampanha[];
}

const FORM_VAZIO: EventoForm = { titulo: '', descricao: '', tipo: 'Marco', sessaoId: null, rotuloData: '', ordem: null, soMestre: false };

/** Distância máxima (px) do centro da tela para um evento contar como "em foco" e abrir o balão. */
const ALCANCE_DO_FOCO = 150;

@Component({
  selector: 'app-linha-do-tempo',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './linha-do-tempo.html',
  styleUrl: './linha-do-tempo.scss',
})
export class LinhaDoTempo implements OnInit {
  private route = inject(ActivatedRoute);
  private campanhas = inject(CampaignService);
  private api = inject(LinhaDoTempoService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private layout = inject(LayoutService);

  private palco = viewChild<ElementRef<HTMLElement>>('palco');

  readonly tipos = TIPOS_EVENTO;

  campanha = signal<Campaign | null>(null);
  carregando = signal(true);
  eventos = signal<EventoCampanha[]>([]);
  sessoes = signal<SessaoResumo[]>([]);

  modo = signal<Modo>('sessao');
  filtro = signal<TipoEvento | null>(null);
  menu = signal<Menu>(null);

  /** Evento mais perto do centro da tela: é o que mostra o balão. */
  focoId = signal<number | null>(null);
  /** Evento aberto no painel de leitura (história completa). */
  leituraId = signal<number | null>(null);

  /** 0 a 1: quanto do palco já foi percorrido. */
  progresso = signal(0);
  arrastando = signal(false);

  // Formulário: `editandoId` null = criando, número = editando; `formAberto` controla o painel
  formAberto = signal(false);
  editandoId = signal<number | null>(null);
  form: EventoForm = { ...FORM_VAZIO };

  ehMestre = computed(() => this.campanha()?.papel === 'Mestre');

  /** Jogadores não veem eventos marcados como "só mestre". */
  private permitidos = computed(() =>
    this.eventos().filter(e => this.ehMestre() || e.visibilidade === 'Todos'));

  visiveis = computed(() => {
    const tipo = this.filtro();
    return this.permitidos().filter(e => !tipo || e.tipo === tipo);
  });

  /** Quantos eventos existem por tipo (para os números nos filtros). */
  contagem = computed(() => {
    const c = new Map<TipoEvento, number>();
    for (const e of this.permitidos()) c.set(e.tipo, (c.get(e.tipo) ?? 0) + 1);
    return c;
  });

  grupos = computed<Grupo[]>(() => {
    const lista = [...this.visiveis()].sort((a, b) => a.ordem - b.ordem);

    if (this.modo() === 'mundo') {
      // Eventos seguidos com a mesma data do mundo formam um capítulo
      const grupos: Grupo[] = [];
      for (const e of lista) {
        const titulo = e.rotuloData?.trim() || 'Sem data';
        const ultimo = grupos.at(-1);
        if (ultimo && ultimo.titulo === titulo) ultimo.eventos.push(e);
        else grupos.push({ chave: `m${grupos.length}`, titulo, eventos: [e] });
      }
      return grupos;
    }

    const porSessao = new Map<number | undefined, EventoCampanha[]>();
    for (const e of lista) {
      const numero = e.sessaoNumero ?? undefined; // a API manda null quando não há sessão
      porSessao.set(numero, [...(porSessao.get(numero) ?? []), e]);
    }
    const grupos: Grupo[] = this.sessoes()
      .filter(s => porSessao.has(s.numero))
      .map(s => ({ chave: `s${s.numero}`, titulo: s.nome, sessao: s, eventos: porSessao.get(s.numero)! }));
    if (porSessao.has(undefined)) grupos.push({ chave: 'sem', titulo: 'Sem sessão', eventos: porSessao.get(undefined)! });
    return grupos;
  });

  /** Todos os eventos na ordem em que aparecem no palco (para as setas e o leitor). */
  private sequencia = computed(() => this.grupos().flatMap(g => g.eventos));

  total = computed(() => this.sequencia().length);

  leitura = computed(() => this.sequencia().find(e => e.eventoId === this.leituraId()) ?? null);

  /** Posição (1 a N) do evento em foco, ou 0 se nenhum. */
  posicao = computed(() => this.sequencia().findIndex(e => e.eventoId === (this.leituraId() ?? this.focoId())) + 1);

  /** "Anteriormente em…": o que o grupo viveu na última sessão com eventos visíveis. */
  anteriormente = computed(() => {
    const ultima = [...this.sessoes()].reverse().find(s => this.permitidos().some(e => e.sessaoNumero === s.numero));
    if (!ultima) return null;
    const eventos = this.permitidos().filter(e => e.sessaoNumero === ultima.numero).sort((a, b) => a.ordem - b.ordem);
    return { sessao: ultima, eventos };
  });

  constructor() {
    // A linha do tempo ocupa a tela toda: some a barra lateral enquanto ela estiver aberta
    this.layout.imersivo.set(true);
    inject(DestroyRef).onDestroy(() => {
      this.layout.imersivo.set(false);
      clearTimeout(this.temporizadorAssentar);
      cancelAnimationFrame(this.quadro);
    });
  }

  ngOnInit() {
    const id = this.campanhaId;
    this.campanhas.getById(id).subscribe({
      next: c => {
        this.campanha.set(c);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
    this.recarregar(id);
  }

  private get campanhaId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  private recarregar(id: number) {
    this.api.listar(id).subscribe({
      next: e => this.eventos.set(e),
      error: () => this.toast.erro('Não foi possível carregar a crônica. Tente de novo.'),
    });
    this.api.sessoesDa(id).subscribe({ next: s => this.sessoes.set(s) });
  }

  // ----- exibição -----
  icone(tipo: TipoEvento): string {
    return this.tipos.find(t => t.tipo === tipo)?.icone ?? '✎';
  }

  /** Markdown vira HTML; o Angular sanitiza ao atribuir via [innerHTML] (texto vem de outros usuários). */
  html(markdown: string): string {
    return marked.parse(markdown ?? '', { async: false }) as string;
  }

  /** Trecho sem marcações para o balão. */
  resumo(e: EventoCampanha): string {
    return (e.descricao ?? '').replace(/[*_`#>[\]]/g, '').replace(/\s+/g, ' ').trim();
  }

  alternarFiltro(tipo: TipoEvento) {
    this.filtro.update(atual => (atual === tipo ? null : tipo));
    this.focoId.set(null);
    queueMicrotask(() => this.aoRolar());
  }

  trocarModo(modo: Modo) {
    this.modo.set(modo);
    this.focoId.set(null);
    this.palco()?.nativeElement.scrollTo({ left: 0 });
    queueMicrotask(() => this.aoRolar());
  }

  alternarMenu(menu: Exclude<Menu, null>) {
    this.menu.update(atual => (atual === menu ? null : menu));
  }

  // ----- palco: foco, rolagem e arrasto -----
  private reduzirMovimento(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Clicar num evento o traz ao centro; clicar de novo no que já está em foco abre a história. */
  clicar(e: EventoCampanha) {
    if (this.arrastando()) return; // o clique que termina um arrasto não conta
    if (this.focoId() === e.eventoId) {
      this.abrirLeitura(e);
    } else {
      this.focoId.set(e.eventoId);
      this.centralizar(e.eventoId);
    }
  }

  abrirLeitura(e: EventoCampanha) {
    this.leituraId.set(e.eventoId);
    this.menu.set(null);
  }

  fecharLeitura() {
    this.leituraId.set(null);
  }

  /** Vai para o evento anterior (-1) ou seguinte (+1); com o leitor aberto, ele acompanha. */
  navegar(passo: number) {
    const lista = this.sequencia();
    if (!lista.length) return;
    const atual = this.leituraId() ?? this.focoId();
    const i = atual === null ? (passo > 0 ? 0 : lista.length - 1) : lista.findIndex(e => e.eventoId === atual) + passo;
    if (i < 0 || i >= lista.length) return;
    const alvo = lista[i];
    this.focoId.set(alvo.eventoId);
    if (this.leituraId() !== null) this.leituraId.set(alvo.eventoId);
    this.centralizar(alvo.eventoId);
  }

  private centralizar(eventoId: number) {
    document.getElementById(`ev-${eventoId}`)?.scrollIntoView({ behavior: this.reduzirMovimento() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }

  irParaCapitulo(chave: string) {
    document.getElementById(`cap-${chave}`)?.scrollIntoView({ behavior: this.reduzirMovimento() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }

  irParaEvento(e: EventoCampanha) {
    this.menu.set(null);
    this.focoId.set(e.eventoId);
    this.centralizar(e.eventoId);
  }

  private quadro = 0;
  private temporizadorAssentar: ReturnType<typeof setTimeout> | undefined;
  private ponteiroPressionado = false;

  /** A cada rolagem: atualiza o progresso e o evento em foco (uma vez por quadro) e agenda o "assentar". */
  aoRolar() {
    cancelAnimationFrame(this.quadro);
    this.quadro = requestAnimationFrame(() => this.atualizarFoco());
    this.agendarAssentar();
  }

  private atualizarFoco() {
    const p = this.palco()?.nativeElement;
    if (!p) return;
    const max = p.scrollWidth - p.clientWidth;
    this.progresso.set(max > 0 ? p.scrollLeft / max : 0);
    // deslocamento do fundo (paralaxe)
    p.parentElement?.style.setProperty('--paralaxe', `${-p.scrollLeft * 0.12}px`);

    const centro = p.getBoundingClientRect().left + p.clientWidth / 2;
    let melhor: { id: number; dist: number } | null = null;
    for (const el of Array.from(p.querySelectorAll<HTMLElement>('.evento'))) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - centro);
      if (!melhor || dist < melhor.dist) melhor = { id: Number(el.id.replace('ev-', '')), dist };
    }
    const novo = melhor && melhor.dist <= ALCANCE_DO_FOCO ? melhor.id : null;
    if (novo !== this.focoId()) this.focoId.set(novo);
  }

  /** Quando a rolagem para, o evento em foco se alinha ao centro (um "ímã" suave). */
  private agendarAssentar() {
    clearTimeout(this.temporizadorAssentar);
    this.temporizadorAssentar = setTimeout(() => {
      if (this.arrastando() || this.ponteiroPressionado) return;
      const id = this.focoId();
      const p = this.palco()?.nativeElement;
      const el = id === null ? null : document.getElementById(`ev-${id}`);
      if (!p || !el) return;
      const r = el.getBoundingClientRect();
      const dist = r.left + r.width / 2 - (p.getBoundingClientRect().left + p.clientWidth / 2);
      if (Math.abs(dist) > 4) this.centralizar(id!);
    }, 220);
  }

  /** A roda do mouse percorre o tempo na horizontal. */
  aoGirarRoda(ev: WheelEvent) {
    const p = this.palco()?.nativeElement;
    if (!p || Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    ev.preventDefault();
    p.scrollLeft += ev.deltaY;
  }

  private arrasto = { ativo: false, x: 0, esquerda: 0 };

  aoPressionar(ev: PointerEvent) {
    if (ev.pointerType === 'touch') return; // no toque o navegador já rola sozinho
    const p = this.palco()?.nativeElement;
    if (!p) return;
    this.ponteiroPressionado = true;
    this.arrasto = { ativo: true, x: ev.clientX, esquerda: p.scrollLeft };
  }

  aoMover(ev: PointerEvent) {
    const p = this.palco()?.nativeElement;
    if (!this.arrasto.ativo || !p) return;
    const dx = ev.clientX - this.arrasto.x;
    if (!this.arrastando() && Math.abs(dx) > 6) this.arrastando.set(true);
    if (this.arrastando()) p.scrollLeft = this.arrasto.esquerda - dx;
  }

  aoSoltar() {
    this.arrasto.ativo = false;
    this.ponteiroPressionado = false;
    // adia um instante para o clique que encerra o arrasto ser ignorado em clicar()
    setTimeout(() => {
      this.arrastando.set(false);
      this.agendarAssentar();
    });
  }

  // ----- teclado -----
  @HostListener('document:keydown', ['$event'])
  aoTeclar(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      if (this.formAberto()) this.cancelar();
      else if (this.menu()) this.menu.set(null);
      else if (this.leituraId() !== null) this.fecharLeitura();
      return;
    }
    const alvo = ev.target as HTMLElement | null;
    if (this.formAberto() || alvo?.closest?.('input, textarea, select')) return;

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      this.navegar(ev.key === 'ArrowRight' ? 1 : -1);
    } else if (ev.key === 'Enter' && (alvo === document.body || alvo?.classList.contains('palco'))) {
      const foco = this.sequencia().find(e => e.eventoId === this.focoId());
      if (foco) {
        ev.preventDefault();
        this.abrirLeitura(foco);
      }
    }
  }

  // ----- permissões (a API real valida de novo; aqui é só para mostrar ou esconder botões) -----
  podeEditar(e: EventoCampanha): boolean {
    return this.ehMestre() || (e.autorEhVoce && e.origem === 'Manual');
  }

  // ----- formulário -----
  novo() {
    this.editandoId.set(null);
    this.menu.set(null);
    const proxima = Math.max(0, ...this.eventos().map(e => e.ordem)) + 1;
    this.form = { ...FORM_VAZIO, ordem: proxima, sessaoId: this.sessoes().at(-1)?.sessaoId ?? null };
    this.formAberto.set(true);
  }

  editar(e: EventoCampanha) {
    this.editandoId.set(e.eventoId);
    this.form = {
      titulo: e.titulo, descricao: e.descricao, tipo: e.tipo, sessaoId: e.sessaoId ?? null,
      rotuloData: e.rotuloData ?? '', ordem: e.ordem, soMestre: e.visibilidade === 'Mestre',
    };
    this.formAberto.set(true);
  }

  cancelar() {
    this.formAberto.set(false);
    this.editandoId.set(null);
  }

  salvar() {
    if (!this.form.titulo.trim()) {
      this.toast.erro('Dê um título ao evento.');
      return;
    }
    // Só o mestre pode esconder um evento dos jogadores
    const dados: EventoForm = { ...this.form, titulo: this.form.titulo.trim(), soMestre: this.ehMestre() && this.form.soMestre };
    const id = this.editandoId();

    const req = id === null ? this.api.criar(this.campanhaId, dados) : this.api.atualizar(this.campanhaId, id, dados);

    req.subscribe({
      next: salvo => {
        this.toast.ok(id === null ? 'Evento adicionado à linha do tempo.' : 'Evento atualizado.');
        this.cancelar();
        this.recarregar(this.campanhaId);
        this.focoId.set(salvo.eventoId);
        // espera o palco redesenhar com o evento novo antes de centralizar
        setTimeout(() => this.centralizar(salvo.eventoId), 80);
      },
      error: err => this.toast.erro(err.error?.message || err.error?.detail || 'Não foi possível salvar o evento.'),
    });
  }

  async excluir(e: EventoCampanha) {
    const ok = await this.confirm.confirmar({
      titulo: 'Excluir evento',
      mensagem: `“${e.titulo}” sairá da linha do tempo da campanha.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    this.api.remover(this.campanhaId, e.eventoId).subscribe({
      next: () => {
        this.toast.ok('Evento excluído.');
        this.fecharLeitura();
        this.focoId.set(null);
        this.recarregar(this.campanhaId);
      },
      error: () => this.toast.erro('Não foi possível excluir o evento.'),
    });
  }
}
