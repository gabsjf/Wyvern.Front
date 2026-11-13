import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { MuralService } from '../../../services/mural.service';
import {
  CORES_DO_MURAL, ConectorMural, CorDoMural, ElementoMural, FormaDoElemento, PontaDoConector, QuadroMural, RefDoCartao, TamanhoDoTexto, TipoElemento,
} from '../../../models/mural';
import {
  Canto, Historico, Retangulo, TAMANHO_PADRAO, alterarConectores, alterarElementos, colar, duplicar, elementoEm, elementosNoRetangulo,
  lerQuadro, limites, mover, novoId, quadroVazio, recorte, redimensionar, remover, reordenar, retanguloEntre, trechoDoConector,
} from '../../../utils/mural';
import { Vista, telaParaMundo, zoomEmTorno } from '../../../../sessoes/utils/mapa-geometria';
import { LayoutService } from '../../../../core/layout/layout.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { PersonagemService } from '../../../../personagens/services/personagem.service';
import { SessaoService } from '../../../../sessoes/services/sessao.service';

export type Ferramenta = 'selecionar' | 'mao' | 'nota' | 'texto' | 'forma' | 'conector';
export type StatusDoMural = 'carregando' | 'salvo' | 'pendente' | 'salvando' | 'erro' | 'conflito' | 'indisponivel';

type Gesto =
  | { tipo: 'pan'; x: number; y: number; vista: Vista }
  | { tipo: 'mover'; inicio: { x: number; y: number }; base: QuadroMural; antes: string; moveu: boolean; ids: Set<string>; clicado: string | null }
  | { tipo: 'redimensionar'; id: string; canto: Canto; original: Retangulo; antes: string; proporcao: boolean; mudou: boolean }
  | { tipo: 'selecao'; inicio: { x: number; y: number }; base: Set<string> }
  | { tipo: 'conector'; de: PontaDoConector }
  | { tipo: 'pinca'; distancia: number; centro: { x: number; y: number }; vista: Vista };

const ESPERA_PARA_SALVAR_MS = 1000;
const LADO_MAXIMO_IMAGEM = 360;
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'];

/** Um cartão possível no seletor: personagem ou sessão da campanha. */
interface OpcaoDeCartao {
  ref: RefDoCartao;
  icone: string;
}

/**
 * O mural: um quadro sem limites, no estilo do Miro, só para o Mestre. Tudo é guardado num documento JSON
 * (elementos e setas) que é salvo sozinho, um segundo depois da última mudança.
 */
@Component({
  selector: 'app-mural-editor',
  imports: [RouterLink],
  templateUrl: './mural-editor.html',
  styleUrl: './mural-editor.scss',
})
export class MuralEditor implements OnInit {
  private route = inject(ActivatedRoute);
  private servico = inject(MuralService);
  private layout = inject(LayoutService);
  private toast = inject(ToastService);
  private personagens = inject(PersonagemService);
  private sessoes = inject(SessaoService);

  private palco = viewChild<ElementRef<HTMLElement>>('palco');
  private entradaDeImagem = viewChild<ElementRef<HTMLInputElement>>('entradaDeImagem');

  readonly campanhaId = Number(this.route.snapshot.paramMap.get('id'));
  readonly muralId = Number(this.route.snapshot.paramMap.get('muralId'));
  readonly cores = CORES_DO_MURAL;
  readonly formas: { id: FormaDoElemento; nome: string; icone: string }[] = [
    { id: 'retangulo', nome: 'Retângulo', icone: 'bi-square' },
    { id: 'elipse', nome: 'Elipse', icone: 'bi-circle' },
    { id: 'losango', nome: 'Losango', icone: 'bi-diamond' },
  ];
  readonly tamanhos: { id: TamanhoDoTexto; nome: string }[] = [{ id: 'p', nome: 'P' }, { id: 'm', nome: 'M' }, { id: 'g', nome: 'G' }];

  // ---------- estado ----------
  readonly quadro = signal<QuadroMural>(quadroVazio());
  readonly nome = signal('');
  readonly vista = signal<Vista>({ x: 0, y: 0, zoom: 1 });
  readonly ferramenta = signal<Ferramenta>('selecionar');
  readonly formaEscolhida = signal<FormaDoElemento>('retangulo');
  readonly corNova = signal<CorDoMural>('amarelo');
  readonly selecao = signal<ReadonlySet<string>>(new Set());
  readonly editando = signal<string | null>(null);
  readonly status = signal<StatusDoMural>('carregando');
  readonly retanguloDeSelecao = signal<Retangulo | null>(null);
  readonly setaEmCurso = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  readonly imagens = signal<ReadonlyMap<number, string>>(new Map());
  readonly espaco = signal(false);
  readonly arrastando = signal(false);

  // seletor de cartões
  readonly cartoesAbertos = signal(false);
  readonly opcoesDeCartao = signal<OpcaoDeCartao[] | null>(null);
  readonly buscaDeCartao = signal('');

  private readonly historico = new Historico();
  /** Nome + documento como estão no servidor: só há o que salvar quando a tela fica diferente disso. */
  private assinaturaSalva = '';
  private versao = 0;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private salvandoAgora = false;
  private salvarDeNovo = false;
  private antesDaEdicao: string | null = null;
  private copiado: QuadroMural | null = null;
  private colagens = 0;
  private gesto: Gesto | null = null;
  private readonly ponteiros = new Map<number, { x: number; y: number }>();
  /** A dica de "como começar" some no primeiro elemento criado. */
  private mostrarDicaInicial = true;

  // ---------- derivados ----------
  readonly transformacao = computed(() => {
    const v = this.vista();
    return `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  });
  readonly zoomEmPorcento = computed(() => Math.round(this.vista().zoom * 100));
  readonly fundoDoPalco = computed(() => {
    const v = this.vista();
    const passo = 24 * v.zoom;
    return { tamanho: `${passo}px ${passo}px`, posicao: `${v.x}px ${v.y}px` };
  });
  readonly setas = computed(() => {
    const q = this.quadro();
    return q.conectores.map(c => ({ conector: c, trecho: trechoDoConector(c, q.elementos), traco: this.traco(c.cor) }));
  });
  readonly elementosSelecionados = computed(() => this.quadro().elementos.filter(e => this.selecao().has(e.id)));
  readonly conectoresSelecionados = computed(() => this.quadro().conectores.filter(c => this.selecao().has(c.id)));
  readonly temSelecao = computed(() => this.selecao().size > 0);
  readonly unicoSelecionado = computed(() => {
    const s = this.elementosSelecionados();
    return s.length === 1 && this.conectoresSelecionados().length === 0 ? s[0] : null;
  });
  readonly soFormas = computed(() => this.elementosSelecionados().length > 0 && this.elementosSelecionados().every(e => e.tipo === 'forma'));
  readonly comTexto = computed(() => this.elementosSelecionados().some(e => e.tipo === 'texto' || e.tipo === 'nota' || e.tipo === 'forma'));
  readonly vazio = computed(() => this.quadro().elementos.length === 0 && this.quadro().conectores.length === 0);
  readonly cartoesFiltrados = computed(() => {
    const termo = this.buscaDeCartao().trim().toLowerCase();
    const lista = this.opcoesDeCartao() ?? [];
    return termo ? lista.filter(o => `${o.ref.titulo} ${o.ref.detalhe ?? ''}`.toLowerCase().includes(termo)) : lista;
  });
  readonly textoDoStatus = computed(() => ({
    carregando: 'Carregando...',
    salvo: 'Tudo salvo',
    pendente: 'Alterações não salvas',
    salvando: 'Salvando...',
    erro: 'Não foi possível salvar',
    conflito: 'Alterado em outra janela',
    indisponivel: 'Mural indisponível',
  })[this.status()]);

  constructor() {
    // o mural ocupa a tela toda, como a Crônica
    this.layout.imersivo.set(true);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.layout.imersivo.set(false);
      this.soltarOuvintes();
      // não perde o que ainda não foi para o servidor
      if (this.status() === 'pendente' || this.status() === 'erro') void this.salvar();
      clearTimeout(this.temporizador);
      for (const url of this.imagens().values()) URL.revokeObjectURL(url);
    });

    // salva sozinho, um pouco depois da última mudança
    effect(() => {
      this.quadro();
      this.nome();
      untracked(() => this.aoMudar());
    });
  }

  async ngOnInit() {
    try {
      const salvo = await firstValueFrom(this.servico.obter(this.campanhaId, this.muralId));
      this.aplicarDoServidor(salvo.nome, salvo.conteudo, salvo.versao);
      setTimeout(() => this.ajustarATela(), 0);
    } catch (erro) {
      this.status.set('indisponivel');
      const e = erro as HttpErrorResponse;
      this.toast.erro(e.status === 403 ? 'Os murais são só do Mestre da campanha.' : 'Não foi possível abrir o mural.');
    }
  }

  private aplicarDoServidor(nome: string, conteudo: string, versao: number) {
    this.nome.set(nome);
    this.quadro.set(lerQuadro(conteudo));
    this.versao = versao;
    this.assinaturaSalva = this.assinatura();
    this.historico.limpar();
    this.selecao.set(new Set());
    this.editando.set(null);
    this.status.set('salvo');
    void this.carregarImagens();
  }

  private assinatura(): string {
    return `${this.nome().trim()}\u0000${JSON.stringify(this.quadro())}`;
  }

  // ---------- gravação ----------

  private aoMudar() {
    const s = this.status();
    if (s === 'carregando' || s === 'conflito' || s === 'indisponivel') return;
    if (this.assinatura() === this.assinaturaSalva) {
      // voltou a ficar igual ao servidor (ex.: desfez a mudança): nada a salvar
      if (s === 'pendente') { clearTimeout(this.temporizador); this.status.set('salvo'); }
      return;
    }
    this.status.set('pendente');
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.salvar(), ESPERA_PARA_SALVAR_MS);
  }

  async salvar(): Promise<void> {
    clearTimeout(this.temporizador);
    if (this.status() === 'conflito' || this.status() === 'indisponivel' || this.status() === 'carregando') return;
    if (this.salvandoAgora) { this.salvarDeNovo = true; return; }
    const enviada = this.assinatura();
    if (enviada === this.assinaturaSalva) { this.status.set('salvo'); return; }

    this.salvandoAgora = true;
    this.status.set('salvando');
    try {
      const r = await firstValueFrom(this.servico.salvar(this.campanhaId, this.muralId, {
        nome: this.nome().trim() || 'Mural sem nome',
        conteudo: JSON.stringify(this.quadro()),
        versao: this.versao,
      }));
      this.versao = r.versao;
      this.assinaturaSalva = enviada;
      // mudou de novo enquanto salvava: continua pendente
      this.status.set(this.assinatura() === enviada ? 'salvo' : 'pendente');
    } catch (erro) {
      const e = erro as HttpErrorResponse;
      if (e.status === 409) {
        this.status.set('conflito');
        this.toast.erro('Este mural foi alterado em outra janela. Recarregue para continuar.');
      } else {
        this.status.set('erro');
      }
    } finally {
      this.salvandoAgora = false;
      if (this.salvarDeNovo || this.status() === 'pendente') {
        this.salvarDeNovo = false;
        if (this.status() === 'pendente') void this.salvar();
      }
    }
  }

  /** Conflito: descarta o que está na tela e abre a versão do servidor. */
  async recarregar() {
    this.status.set('carregando');
    try {
      const salvo = await firstValueFrom(this.servico.obter(this.campanhaId, this.muralId));
      this.aplicarDoServidor(salvo.nome, salvo.conteudo, salvo.versao);
    } catch {
      this.status.set('indisponivel');
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  avisarAntesDeSair(ev: BeforeUnloadEvent) {
    if (this.status() === 'pendente' || this.status() === 'salvando' || this.status() === 'erro') {
      ev.preventDefault();
      ev.returnValue = '';
    }
  }

  // ---------- mudanças com desfazer ----------

  /** Troca o quadro guardando o estado anterior no histórico. */
  private aplicar(novo: QuadroMural) {
    this.historico.registrar(JSON.stringify(this.quadro()));
    this.quadro.set(novo);
  }

  get podeDesfazer() { return this.historico.podeDesfazer; }
  get podeRefazer() { return this.historico.podeRefazer; }

  desfazer() {
    this.terminarEdicao();
    const anterior = this.historico.desfazer(JSON.stringify(this.quadro()));
    if (anterior) { this.quadro.set(lerQuadro(anterior)); this.limparSelecaoInexistente(); }
  }

  refazer() {
    this.terminarEdicao();
    const proximo = this.historico.refazer(JSON.stringify(this.quadro()));
    if (proximo) { this.quadro.set(lerQuadro(proximo)); this.limparSelecaoInexistente(); }
  }

  private limparSelecaoInexistente() {
    const q = this.quadro();
    const existe = new Set([...q.elementos.map(e => e.id), ...q.conectores.map(c => c.id)]);
    this.selecao.set(new Set([...this.selecao()].filter(id => existe.has(id))));
  }

  // ---------- coordenadas ----------

  private tela(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.palco()?.nativeElement.getBoundingClientRect();
    return { x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) };
  }

  private mundo(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const t = this.tela(ev);
    return telaParaMundo(this.vista(), t.x, t.y);
  }

  /** Centro da área visível, em coordenadas do mundo (onde nascem imagens e cartões). */
  private centroVisivel(): { x: number; y: number } {
    const r = this.palco()?.nativeElement.getBoundingClientRect();
    return telaParaMundo(this.vista(), (r?.width ?? 800) / 2, (r?.height ?? 600) / 2);
  }

  // ---------- ferramentas ----------

  escolher(f: Ferramenta) {
    this.terminarEdicao();
    this.ferramenta.set(f);
  }

  escolherForma(forma: FormaDoElemento) {
    this.formaEscolhida.set(forma);
    this.escolher('forma');
  }

  /** Cria um elemento centrado no ponto e já seleciona; notas, textos e formas abrem para digitar. */
  criar(tipo: TipoElemento, ponto: { x: number; y: number }, extra: Partial<ElementoMural> = {}): ElementoMural {
    const t = TAMANHO_PADRAO[tipo];
    const w = extra.w ?? t.w, h = extra.h ?? t.h;
    const el: ElementoMural = {
      id: novoId(), tipo, x: Math.round(ponto.x - w / 2), y: Math.round(ponto.y - h / 2), w, h,
      cor: tipo === 'texto' ? 'branco' : this.corNova(), texto: '',
      ...(tipo === 'forma' ? { forma: this.formaEscolhida() } : {}),
      ...(tipo === 'texto' ? { tamanho: 'm' as TamanhoDoTexto } : {}),
      ...extra,
    };
    this.aplicar({ ...this.quadro(), elementos: [...this.quadro().elementos, el] });
    this.selecao.set(new Set([el.id]));
    this.ferramenta.set('selecionar');
    this.mostrarDicaInicial = false;
    if (tipo === 'nota' || tipo === 'texto' || tipo === 'forma') this.iniciarEdicao(el.id);
    return el;
  }

  // ---------- gestos ----------

  aoApertar(ev: PointerEvent) {
    const alvo = ev.target as HTMLElement;
    if (alvo.closest('textarea, a, button, input')) return; // digitando, clicando num link de cartão ou num botão
    if (this.editando()) this.terminarEdicao();

    this.ponteiros.set(ev.pointerId, this.tela(ev));
    if (this.ponteiros.size === 2) { this.iniciarPinca(); return; }
    if (this.gesto) return;

    ev.preventDefault();
    const p = this.mundo(ev);
    const t = this.tela(ev);
    const ferramenta = this.ferramenta();
    const idElemento = alvo.closest<HTMLElement>('[data-id]')?.dataset['id'] ?? null;
    const idSeta = alvo.closest<HTMLElement>('[data-conector]')?.dataset['conector'] ?? null;
    const canto = alvo.closest<HTMLElement>('[data-alca]')?.dataset['alca'] as Canto | undefined;
    const vazioNoToque = ev.pointerType === 'touch' && !idElemento && !idSeta && ferramenta === 'selecionar';

    if (ev.button === 1 || ferramenta === 'mao' || this.espaco() || vazioNoToque) {
      this.gesto = { tipo: 'pan', x: t.x, y: t.y, vista: this.vista() };
    } else if (ferramenta === 'nota' || ferramenta === 'texto' || ferramenta === 'forma') {
      this.ponteiros.delete(ev.pointerId);
      this.criar(ferramenta, p);
      return;
    } else if (ferramenta === 'conector') {
      const de = idElemento ? this.quadro().elementos.find(e => e.id === idElemento) : undefined;
      this.gesto = { tipo: 'conector', de: de ? { elementoId: de.id, x: de.x + de.w / 2, y: de.y + de.h / 2 } : { x: p.x, y: p.y } };
      this.setaEmCurso.set({ x1: this.gesto.de.x, y1: this.gesto.de.y, x2: p.x, y2: p.y });
    } else if (canto && this.unicoSelecionado()) {
      const e = this.unicoSelecionado()!;
      this.gesto = { tipo: 'redimensionar', id: e.id, canto, original: { x: e.x, y: e.y, w: e.w, h: e.h }, antes: JSON.stringify(this.quadro()), proporcao: e.tipo === 'imagem', mudou: false };
    } else if (idElemento || idSeta) {
      const id = (idElemento ?? idSeta)!;
      const atual = new Set(this.selecao());
      if (ev.shiftKey) { if (atual.has(id)) atual.delete(id); else atual.add(id); }
      else if (!atual.has(id)) { atual.clear(); atual.add(id); }
      this.selecao.set(atual);
      this.gesto = { tipo: 'mover', inicio: p, base: this.quadro(), antes: JSON.stringify(this.quadro()), moveu: false, ids: atual, clicado: ev.shiftKey ? null : id };
    } else {
      const base = ev.shiftKey ? new Set(this.selecao()) : new Set<string>();
      if (!ev.shiftKey) this.selecao.set(new Set());
      this.gesto = { tipo: 'selecao', inicio: p, base };
    }

    window.addEventListener('pointermove', this.aoMover);
    window.addEventListener('pointerup', this.aoSoltar);
    window.addEventListener('pointercancel', this.aoSoltar);
  }

  private iniciarPinca() {
    const [a, b] = [...this.ponteiros.values()];
    this.gesto = { tipo: 'pinca', distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vista: this.vista() };
    this.retanguloDeSelecao.set(null);
    this.setaEmCurso.set(null);
    window.addEventListener('pointermove', this.aoMover);
    window.addEventListener('pointerup', this.aoSoltar);
    window.addEventListener('pointercancel', this.aoSoltar);
  }

  private aoMover = (ev: PointerEvent) => {
    if (this.ponteiros.has(ev.pointerId)) this.ponteiros.set(ev.pointerId, this.tela(ev));
    const g = this.gesto;
    if (!g) return;
    const p = this.mundo(ev);
    const t = this.tela(ev);

    switch (g.tipo) {
      case 'pan':
        this.arrastando.set(true);
        this.vista.set({ ...g.vista, x: g.vista.x + (t.x - g.x), y: g.vista.y + (t.y - g.y) });
        break;
      case 'pinca': {
        if (this.ponteiros.size < 2) return;
        const [a, b] = [...this.ponteiros.values()];
        const distancia = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const comZoom = zoomEmTorno(g.vista, g.vista.zoom * (distancia / g.distancia), g.centro.x, g.centro.y);
        this.vista.set({ ...comZoom, x: comZoom.x + (centro.x - g.centro.x), y: comZoom.y + (centro.y - g.centro.y) });
        break;
      }
      case 'mover': {
        const dx = p.x - g.inicio.x, dy = p.y - g.inicio.y;
        if (!g.moveu && Math.hypot(dx, dy) * this.vista().zoom < 3) return;
        g.moveu = true;
        this.arrastando.set(true);
        this.quadro.set(mover(g.base, g.ids, Math.round(dx), Math.round(dy)));
        break;
      }
      case 'redimensionar': {
        const novo = redimensionar(g.original, g.canto, p.x, p.y, g.proporcao || ev.shiftKey);
        g.mudou = true;
        this.quadro.set(alterarElementos(this.quadro(), new Set([g.id]), {
          x: Math.round(novo.x), y: Math.round(novo.y), w: Math.round(novo.w), h: Math.round(novo.h),
        }));
        break;
      }
      case 'selecao': {
        const r = retanguloEntre(g.inicio.x, g.inicio.y, p.x, p.y);
        this.retanguloDeSelecao.set(r);
        this.selecao.set(new Set([...g.base, ...elementosNoRetangulo(this.quadro().elementos, r)]));
        break;
      }
      case 'conector':
        this.setaEmCurso.set({ x1: g.de.x, y1: g.de.y, x2: p.x, y2: p.y });
        break;
    }
  };

  private aoSoltar = (ev: PointerEvent) => {
    this.ponteiros.delete(ev.pointerId);
    const g = this.gesto;
    if (g?.tipo === 'pinca' && this.ponteiros.size > 0) return; // ainda tem um dedo na tela
    this.gesto = null;
    this.arrastando.set(false);
    this.soltarOuvintes();
    if (!g) return;
    const p = this.mundo(ev);

    if (g.tipo === 'mover') {
      if (g.moveu) this.historico.registrar(g.antes);
      // clique (sem arrastar) num item de uma seleção maior: fica só ele
      else if (g.clicado && g.ids.size > 1) this.selecao.set(new Set([g.clicado]));
    } else if (g.tipo === 'redimensionar') {
      if (g.mudou) this.historico.registrar(g.antes);
    } else if (g.tipo === 'selecao') {
      this.retanguloDeSelecao.set(null);
    } else if (g.tipo === 'conector') {
      this.setaEmCurso.set(null);
      this.terminarSeta(g.de, p);
    }
  };

  private soltarOuvintes() {
    window.removeEventListener('pointermove', this.aoMover);
    window.removeEventListener('pointerup', this.aoSoltar);
    window.removeEventListener('pointercancel', this.aoSoltar);
  }

  /** Solta a seta: presa ao elemento sob o cursor, ou solta no ponto. Muito curta, ou de um elemento para ele mesmo, não vale. */
  private terminarSeta(de: PontaDoConector, p: { x: number; y: number }) {
    const alvo = elementoEm(this.quadro().elementos, p.x, p.y);
    const para: PontaDoConector = alvo ? { elementoId: alvo.id, x: alvo.x + alvo.w / 2, y: alvo.y + alvo.h / 2 } : { x: p.x, y: p.y };
    if (de.elementoId && de.elementoId === para.elementoId) return;
    if (!de.elementoId && !para.elementoId && Math.hypot(para.x - de.x, para.y - de.y) < 12) return;
    const seta: ConectorMural = { id: novoId(), de, para, cor: 'cinza', seta: true };
    this.aplicar({ ...this.quadro(), conectores: [...this.quadro().conectores, seta] });
    this.selecao.set(new Set([seta.id]));
    this.ferramenta.set('selecionar');
  }

  aoRolar(ev: WheelEvent) {
    ev.preventDefault();
    const t = this.tela(ev);
    // pinça no touchpad chega como roda com Ctrl: mais sensível
    const fator = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
    this.vista.set(zoomEmTorno(this.vista(), this.vista().zoom * fator, t.x, t.y));
  }

  aoDuploClique(ev: MouseEvent) {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset['id'];
    const el = id ? this.quadro().elementos.find(e => e.id === id) : undefined;
    if (el && (el.tipo === 'nota' || el.tipo === 'texto' || el.tipo === 'forma')) {
      this.selecao.set(new Set([el.id]));
      this.iniciarEdicao(el.id);
    } else if (!el && this.ferramenta() === 'selecionar') {
      // duplo clique no vazio: uma nota ali mesmo
      this.criar('nota', this.mundo(ev));
    }
  }

  // ---------- texto ----------

  iniciarEdicao(id: string) {
    this.antesDaEdicao = JSON.stringify(this.quadro());
    this.editando.set(id);
    setTimeout(() => {
      const campo = this.palco()?.nativeElement.querySelector<HTMLTextAreaElement>(`[data-id="${CSS.escape(id)}"] textarea`);
      campo?.focus();
      campo?.setSelectionRange(campo.value.length, campo.value.length);
    }, 0);
  }

  aoDigitar(id: string, valor: string) {
    this.quadro.set(alterarElementos(this.quadro(), new Set([id]), { texto: valor }));
  }

  terminarEdicao() {
    const id = this.editando();
    if (!id) return;
    this.editando.set(null);
    const el = this.quadro().elementos.find(e => e.id === id);
    // texto que ficou vazio não tem por que existir
    if (el?.tipo === 'texto' && !el.texto.trim()) {
      this.quadro.set(remover(this.quadro(), new Set([id])));
      this.selecao.set(new Set());
    }
    if (this.antesDaEdicao && this.antesDaEdicao !== JSON.stringify(this.quadro())) this.historico.registrar(this.antesDaEdicao);
    this.antesDaEdicao = null;
  }

  aoTeclarNoTexto(ev: KeyboardEvent) {
    if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) {
      ev.preventDefault();
      this.terminarEdicao();
    }
    ev.stopPropagation(); // atalhos do quadro não valem enquanto digita
  }

  // ---------- seleção: barra de contexto ----------

  mudarCor(cor: CorDoMural) {
    this.corNova.set(cor);
    if (!this.temSelecao()) return;
    const ids = this.selecao();
    this.aplicar(alterarConectores(alterarElementos(this.quadro(), ids, { cor }), ids, { cor }));
  }

  mudarForma(forma: FormaDoElemento) {
    this.formaEscolhida.set(forma);
    const ids = new Set(this.elementosSelecionados().filter(e => e.tipo === 'forma').map(e => e.id));
    if (ids.size) this.aplicar(alterarElementos(this.quadro(), ids, { forma }));
  }

  mudarTamanho(tamanho: TamanhoDoTexto) {
    const ids = new Set(this.elementosSelecionados().filter(e => e.tipo !== 'imagem' && e.tipo !== 'cartao').map(e => e.id));
    if (ids.size) this.aplicar(alterarElementos(this.quadro(), ids, { tamanho }));
  }

  alternarPontaDaSeta() {
    const setas = this.conectoresSelecionados();
    if (!setas.length) return;
    const comSeta = !setas.every(c => c.seta);
    this.aplicar(alterarConectores(this.quadro(), new Set(setas.map(c => c.id)), { seta: comSeta }));
  }

  trazerParaFrente() { if (this.temSelecao()) this.aplicar(reordenar(this.quadro(), this.selecao(), true)); }
  enviarParaTras() { if (this.temSelecao()) this.aplicar(reordenar(this.quadro(), this.selecao(), false)); }

  duplicarSelecao() {
    if (!this.temSelecao()) return;
    const { quadro, novos } = duplicar(this.quadro(), this.selecao());
    this.aplicar(quadro);
    this.selecao.set(new Set(novos));
  }

  excluirSelecao() {
    if (!this.temSelecao()) return;
    this.aplicar(remover(this.quadro(), this.selecao()));
    this.selecao.set(new Set());
  }

  copiar() {
    if (!this.temSelecao()) return;
    this.copiado = recorte(this.quadro(), this.selecao());
    this.colagens = 0;
  }

  colarCopiado() {
    if (!this.copiado || (!this.copiado.elementos.length && !this.copiado.conectores.length)) return;
    this.colagens++;
    const { quadro, novos } = colar(this.quadro(), this.copiado, 24 * this.colagens);
    this.aplicar(quadro);
    this.selecao.set(new Set(novos));
  }

  selecionarTudo() {
    const q = this.quadro();
    this.selecao.set(new Set([...q.elementos.map(e => e.id), ...q.conectores.map(c => c.id)]));
  }

  // ---------- zoom ----------

  zoomar(fator: number) {
    const r = this.palco()?.nativeElement.getBoundingClientRect();
    this.vista.set(zoomEmTorno(this.vista(), this.vista().zoom * fator, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  }

  zoomCem() {
    const r = this.palco()?.nativeElement.getBoundingClientRect();
    this.vista.set(zoomEmTorno(this.vista(), 1, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  }

  /** Mostra tudo o que há no quadro, com uma folga; num quadro vazio, volta à origem a 100%. */
  ajustarATela() {
    const r = this.palco()?.nativeElement.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const caixa = limites(this.quadro());
    if (!caixa) { this.vista.set({ x: r.width / 2, y: r.height / 2, zoom: 1 }); return; }
    const folga = 80;
    const zoom = Math.min(1.5, Math.max(0.1, Math.min((r.width - folga) / Math.max(caixa.w, 1), (r.height - folga) / Math.max(caixa.h, 1))));
    this.vista.set({ zoom, x: r.width / 2 - (caixa.x + caixa.w / 2) * zoom, y: r.height / 2 - (caixa.y + caixa.h / 2) * zoom });
  }

  // ---------- teclado ----------

  @HostListener('document:keydown', ['$event'])
  aoTeclar(ev: KeyboardEvent) {
    const alvo = ev.target as HTMLElement | null;
    if (this.editando() || alvo?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const tecla = ev.key.toLowerCase();

    if (ev.key === ' ') { this.espaco.set(true); ev.preventDefault(); return; }
    if (ctrl && tecla === 'z') { ev.preventDefault(); if (ev.shiftKey) this.refazer(); else this.desfazer(); return; }
    if (ctrl && tecla === 'y') { ev.preventDefault(); this.refazer(); return; }
    if (ctrl && tecla === 'd') { ev.preventDefault(); this.duplicarSelecao(); return; }
    if (ctrl && tecla === 'c') { this.copiar(); return; }
    if (ctrl && tecla === 'v') { ev.preventDefault(); this.colarCopiado(); return; }
    if (ctrl && tecla === 'a') { ev.preventDefault(); this.selecionarTudo(); return; }
    if (ctrl && tecla === 's') { ev.preventDefault(); void this.salvar(); return; }
    if (ctrl) return;

    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.excluirSelecao(); return; }
    if (ev.key === 'Escape') { this.selecao.set(new Set()); this.ferramenta.set('selecionar'); this.cartoesAbertos.set(false); return; }
    if (ev.key === 'Enter' && this.unicoSelecionado()) {
      const e = this.unicoSelecionado()!;
      if (e.tipo === 'nota' || e.tipo === 'texto' || e.tipo === 'forma') { ev.preventDefault(); this.iniciarEdicao(e.id); }
      return;
    }
    if (ev.key.startsWith('Arrow') && this.temSelecao()) {
      ev.preventDefault();
      const passo = ev.shiftKey ? 20 : 2;
      const dx = ev.key === 'ArrowLeft' ? -passo : ev.key === 'ArrowRight' ? passo : 0;
      const dy = ev.key === 'ArrowUp' ? -passo : ev.key === 'ArrowDown' ? passo : 0;
      this.aplicar(mover(this.quadro(), this.selecao(), dx, dy));
      return;
    }
    const atalhos: Record<string, Ferramenta> = { v: 'selecionar', h: 'mao', n: 'nota', t: 'texto', r: 'forma', l: 'conector' };
    if (atalhos[tecla]) { this.escolher(atalhos[tecla]); return; }
    if (tecla === '+' || tecla === '=') this.zoomar(1.2);
    else if (tecla === '-') this.zoomar(1 / 1.2);
    else if (tecla === '0') this.zoomCem();
    else if (tecla === '1') this.ajustarATela();
  }

  @HostListener('document:keyup', ['$event'])
  aoSoltarTecla(ev: KeyboardEvent) {
    if (ev.key === ' ') this.espaco.set(false);
  }

  // ---------- imagens ----------

  escolherImagem() {
    this.terminarEdicao();
    this.entradaDeImagem()?.nativeElement.click();
  }

  async aoEscolherImagem(ev: Event) {
    const entrada = ev.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    if (!arquivo) return;
    if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) { this.toast.erro('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) { this.toast.erro('A imagem precisa ter até 5 MB.'); return; }

    try {
      const [{ imagemId }, tamanho] = await Promise.all([
        firstValueFrom(this.servico.enviarImagem(this.campanhaId, this.muralId, arquivo, arquivo.name)),
        tamanhoDaImagem(arquivo),
      ]);
      const url = URL.createObjectURL(arquivo);
      this.imagens.update(m => new Map(m).set(imagemId, url));
      const escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(tamanho.w, tamanho.h, 1));
      this.criar('imagem', this.centroVisivel(), { imagemId, w: Math.round(tamanho.w * escala) || 320, h: Math.round(tamanho.h * escala) || 240, cor: 'branco' });
    } catch (erro) {
      const e = erro as HttpErrorResponse;
      this.toast.erro(e?.error?.message || 'Não foi possível enviar a imagem.');
    }
  }

  private async carregarImagens() {
    const faltando = this.quadro().elementos
      .filter(e => e.tipo === 'imagem' && e.imagemId !== undefined && !this.imagens().has(e.imagemId))
      .map(e => e.imagemId!);
    for (const id of new Set(faltando)) {
      try {
        const url = await this.servico.imagem(this.campanhaId, this.muralId, id);
        this.imagens.update(m => new Map(m).set(id, url));
      } catch { /* imagem que não carrega aparece como um quadro vazio */ }
    }
  }

  // ---------- cartões ----------

  async abrirCartoes() {
    this.terminarEdicao();
    this.cartoesAbertos.set(true);
    this.buscaDeCartao.set('');
    if (this.opcoesDeCartao()) return;
    try {
      const [personagens, sessoes] = await Promise.all([firstValueFrom(this.personagens.getAll()), firstValueFrom(this.sessoes.getAll())]);
      const daCampanha = personagens.filter(p => p.campanhaId === this.campanhaId && p.personagemId !== undefined);
      const rotulo = (tipoId: number) => (tipoId === 1 ? 'Herói' : tipoId === 2 ? 'NPC' : 'Monstro');
      this.opcoesDeCartao.set([
        ...daCampanha.map(p => ({
          icone: p.tipoId === 1 ? 'bi-person' : 'bi-emoji-angry',
          ref: {
            tipo: 'personagem' as const, id: p.personagemId!, titulo: p.nome,
            detalhe: [rotulo(p.tipoId), p.personagemPlayer?.classe, p.personagemPlayer?.nivel ? `nível ${p.personagemPlayer.nivel}` : null].filter(Boolean).join(' · '),
          },
        })),
        ...sessoes.filter(s => s.campanhaId === this.campanhaId && s.sessaoId !== undefined)
          .sort((a, b) => b.numeroSessao - a.numeroSessao)
          .map(s => ({ icone: 'bi-calendar-event', ref: { tipo: 'sessao' as const, id: s.sessaoId!, titulo: s.nome, detalhe: `Sessão ${s.numeroSessao}` } })),
      ]);
    } catch {
      this.opcoesDeCartao.set([]);
      this.toast.erro('Não foi possível carregar os personagens e as sessões.');
    }
  }

  adicionarCartao(o: OpcaoDeCartao) {
    this.cartoesAbertos.set(false);
    this.criar('cartao', this.centroVisivel(), { ref: { ...o.ref }, cor: 'branco' });
  }

  linkDoCartao(e: ElementoMural): unknown[] {
    return e.ref?.tipo === 'sessao' ? ['/sessoes', e.ref.id] : ['/ficha', e.ref?.id];
  }

  // ---------- aparência ----------

  fundo(cor: CorDoMural): string {
    return CORES_DO_MURAL.find(c => c.id === cor)?.fundo ?? '#fde68a';
  }

  traco(cor: CorDoMural): string {
    return CORES_DO_MURAL.find(c => c.id === cor)?.traco ?? '#57534e';
  }

  tamanhoDaFonte(e: ElementoMural): number {
    const base = e.tipo === 'texto' ? { p: 16, m: 24, g: 40 } : { p: 14, m: 18, g: 26 };
    return base[e.tamanho ?? 'm'];
  }

  get mostrarDica(): boolean {
    return this.mostrarDicaInicial && this.vazio() && this.status() !== 'carregando';
  }
}

function tamanhoDaImagem(arquivo: Blob): Promise<{ w: number; h: number }> {
  return new Promise(resolver => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { resolver({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolver({ w: 320, h: 240 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
