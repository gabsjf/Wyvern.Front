import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, input, signal, viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CenaService, PingDoMapa, ReguaDeOutro } from '../../services/cena.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Membro } from '../../../campaigns/models/campaign';
import {
  Neblina, aplicarRetangulo, areaRevelada, decodificar, estaRevelado, retanguloEntre,
} from '../../utils/neblina';
import { CombateService } from '../../services/combate.service';
import {
  Cena, CORES_TOKEN, CorToken, ICONES_MARCADOR, Marcador, MarcadorForm, MovimentoToken, Parede, Traco, TokenCena, TokenForm,
} from '../../models/cena';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { linhaLivre, maisProximo, poligonoDeVisao, Segmento } from '../../utils/visao';
import { alcance, custoAte, indiceDe, quadradosCobertos, quadradosEm } from '../../utils/movimento';
import { prepararRetrato } from '../../utils/retrato';
import {
  Vista, ajustarAoPalco, distanciaEmPes, distanciaEmQuadrados, iniciais, limitarAoMapa, limitarZoom, quadradoEm,
  telaParaMundo, zoomEmTorno,
} from '../../utils/mapa-geometria';
import { ArrastoDe3d, Mapa3d, MovimentoDe3d, PontoDeRegua3d, Regua3d } from './mapa-3d/mapa-3d';
import { PapelCampanha, PapelService } from '../../../campaigns/services/papel.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { CONDICOES, alternarCondicao, lerCondicoes, temCondicao } from '../../../personagens/utils/condicoes';

type Ferramenta = 'mover' | 'regua' | 'revelar' | 'cobrir' | 'area' | 'parede' | 'porta' | 'janela' | 'apagar' | 'marcador' | 'desenhar' | 'borracha';
type TipoDeParede = 'parede' | 'porta' | 'janela';
type FormaDeArea = 'esfera' | 'cone' | 'linha';

interface Gesto {
  tipo: 'pan' | 'token' | 'regua' | 'pinca' | 'neblina' | 'area' | 'parede' | 'marcador' | 'desenho';
  /** Posição do ponteiro (na tela, relativa ao palco) quando o gesto começou. */
  inicioX: number;
  inicioY: number;
  vistaInicial: Vista;
  moveu: boolean;
  tokenId?: number;
  marcadorId?: number;
  /** Distância do ponteiro ao canto do token, em pixels do mundo, para o token não "pular" para o cursor. */
  deslocX?: number;
  deslocY?: number;
  distanciaInicial?: number;
}

/** O que o token mostra do combate em que está. */
interface InfoDeCombate {
  turno: boolean;
  abatido: boolean;
  vida: { atual: number; maxima: number; pct: number } | null;
  condicoes: string[];
}

const LIMITE_ARRASTO_PX = 4;
const TOQUE_LONGO_MS = 550;
const DURACAO_DO_PING_MS = 3200;
const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'];
const TAMANHO_MAXIMO_IMAGEM = 8 * 1024 * 1024;

@Component({
  selector: 'app-mapa-tatico',
  imports: [FormsModule, DecimalPipe, Mapa3d],
  templateUrl: './mapa-tatico.html',
  styleUrl: './mapa-tatico.scss',
})
export class MapaTatico implements OnInit, AfterViewInit, OnDestroy {
  private cenaService = inject(CenaService);
  private combateService = inject(CombateService);
  private papelService = inject(PapelService);
  private personagemService = inject(PersonagemService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private campanhas = inject(CampaignService);
  private sessaoService = inject(SessaoService);

  readonly campanhaId = input.required<number>();
  readonly sessaoId = input.required<number>();

  private palco = viewChild<ElementRef<HTMLElement>>('palco');
  private canvasNeblina = viewChild<ElementRef<HTMLCanvasElement>>('canvasNeblina');
  private canvasAlcance = viewChild<ElementRef<HTMLCanvasElement>>('canvasAlcance');

  readonly cores = CORES_TOKEN;
  readonly tamanhos = [1, 2, 3, 4];
  readonly meuId = Number(localStorage.getItem('usuarioId')) || 0;

  // ---------- estado ----------
  readonly papel = signal<PapelCampanha>('Jogador');
  readonly ehMestre = computed(() => this.papel() === 'Mestre');
  readonly carregando = signal(true);
  readonly conectado = signal(false);

  readonly cenas = signal<Cena[]>([]);
  readonly cenaId = signal<number | null>(null);
  readonly cena = computed(() => this.cenas().find(c => c.cenaId === this.cenaId()) ?? null);
  readonly tokens = signal<TokenCena[]>([]);
  readonly imagemUrl = signal<string | null>(null);

  readonly vista = signal<Vista>({ x: 0, y: 0, zoom: 1 });
  readonly ferramenta = signal<Ferramenta>('mover');
  readonly selecionadoId = signal<number | null>(null);
  readonly selecionado = computed(() => this.tokens().find(t => t.tokenId === this.selecionadoId()) ?? null);
  /** Token sendo arrastado: posição do canto, em pixels do mundo (fora da grade, até soltar). */
  readonly arrasto = signal<{ tokenId: number; x: number; y: number } | null>(null);
  readonly regua = signal<{ c1: number; l1: number; c2: number; l2: number } | null>(null);

  // névoa de guerra
  readonly neblina = signal<Neblina | null>(null);
  /** Retângulo (em quadrados) que o Mestre está desenhando para revelar ou cobrir. */
  readonly retanguloNeblina = signal<{ c1: number; l1: number; c2: number; l2: number } | null>(null);
  readonly neblinaAtiva = computed(() => !!this.neblina()?.ativa);
  /** A canvas da névoa, para o 3D usar de textura; `versaoNeblina` avisa quando ela foi redesenhada. */
  readonly neblinaCanvas = computed(() => this.canvasNeblina()?.nativeElement ?? null);
  readonly versaoNeblina = signal(0);
  readonly alcanceCanvas = computed(() => this.canvasAlcance()?.nativeElement ?? null);
  readonly versaoAlcance = signal(0);

  /** Vista em 3D (Three.js): só desenha; as regras de movimento continuam as mesmas do 2D. */
  readonly modo3d = signal(false);
  readonly paredesVisiveis = computed(() => this.ehMestre() ? this.paredes() : this.paredes().filter(w => w.porta || w.janela));

  // "olhem aqui"
  readonly pings = signal<(PingDoMapa & { chave: number })[]>([]);
  private proximoPing = 1;
  private toqueLongo: ReturnType<typeof setTimeout> | undefined;

  // modelos de área de magia (só na tela de quem desenha, como a régua)
  readonly formasDeArea: { valor: FormaDeArea; nome: string }[] = [
    { valor: 'esfera', nome: 'Esfera' }, { valor: 'cone', nome: 'Cone' }, { valor: 'linha', nome: 'Linha' },
  ];
  readonly temposDeArea = [5, 10, 15, 20, 30, 40, 60, 90, 120];
  readonly formaDeArea = signal<FormaDeArea>('esfera');
  readonly pesDaArea = signal(20);
  /** Origem e ponto apontado, em pixels do mundo. */
  readonly area = signal<{ ox: number; oy: number; px: number; py: number } | null>(null);

  /** Jogadores da campanha, para dar o controle de um token a alguém. */
  readonly membros = signal<Membro[]>([]);

  // paredes e portas: bloqueiam a visão dos tokens
  readonly paredes = signal<Parede[]>([]);
  /** Segmento (em cruzamentos da grade) que o Mestre está desenhando. */
  readonly paredeEmCurso = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  /** O que de fato bloqueia a visão, em pixels do mundo: paredes e portas fechadas. */
  readonly segmentosDeVisao = computed<Segmento[]>(() => {
    const celula = this.cena()?.tamanhoCelula ?? 70;
    return this.paredes()
      .filter(p => !(p.porta && p.aberta) && !p.janela)
      .map(p => ({ x1: p.x1 * celula, y1: p.y1 * celula, x2: p.x2 * celula, y2: p.y2 * celula }));
  });

  /** As cenas do menu, em dois grupos quando há mapas de outras sessões. */
  readonly cenasDoMenu = computed(() => {
    const { daSessao, outras } = this.cenasPorSessao();
    const dividir = daSessao.length > 0 && outras.length > 0;
    return [
      ...daSessao.map((cena, i) => ({ cena, titulo: dividir && i === 0 ? 'Desta sessão' : null })),
      ...outras.map((cena, i) => ({ cena, titulo: dividir && i === 0 ? 'Outras sessões e avulsos' : null })),
    ];
  });

  /** As paredes que barram o passo (sem as portas abertas), em quadrados, como o cálculo de caminho espera. */
  readonly barreirasEmQuadrados = computed<Segmento[]>(() =>
    this.paredes().filter(p => !(p.porta && p.aberta)).map(p => ({ x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 })));

  readonly metrosPorQuadrado = computed(() => this.cena()?.metrosPorQuadrado || 1.5);
  private carimboAtual = computed(() => {
    const c = this.combate();
    return c ? c.combateId + ':' + c.rodadaAtual : null;
  });

  /**
   * Para onde o token selecionado pode ir: cada quadrado a que ele chega, pelo caminho (contornando paredes), com o
   * deslocamento que lhe resta. Só aparece para o Mestre e para o dono do token.
   */
  readonly alcanceVisivel = computed(() => {
    const cena = this.cena();
    const t = this.selecionado();
    if (!cena || !t) return null;
    if (!this.ehMestre() && !t.donosIds.includes(this.meuId)) return null;
    const orcamento = this.orcamentoDe(t);
    if (!orcamento || orcamento.restante <= 0) return null;

    const grade = { colunas: Math.max(1, Math.floor(cena.largura / cena.tamanhoCelula)), linhas: Math.max(1, Math.floor(cena.altura / cena.tamanhoCelula)) };
    const mapa = alcance(grade, t.tamanho, t.coluna, t.linha, this.barreirasEmQuadrados(), Math.min(orcamento.restante, 120));
    return { tokenId: t.tokenId, grade, mapa, cobertos: quadradosCobertos(grade, t.tamanho, mapa) };
  });

  /** Enquanto o token é arrastado: quanto custa chegar ao quadrado onde ele cairia, ou que está fora de alcance. */
  readonly custoDoArrasto = computed(() => {
    const a = this.arrasto();
    const cena = this.cena();
    const t = this.selecionado();
    const al = this.alcanceVisivel();
    if (!a || !cena || !t || !al || a.tokenId !== t.tokenId) return null;
    const destino = limitarAoMapa(
      Math.round(a.x / cena.tamanhoCelula), Math.round(a.y / cena.tamanhoCelula), t.tamanho, cena.largura, cena.altura, cena.tamanhoCelula);
    const custo = al.mapa.get(indiceDe(al.grade, destino.coluna, destino.linha)) ?? null;
    return {
      x: (destino.coluna + t.tamanho / 2) * cena.tamanhoCelula,
      y: (destino.linha + t.tamanho / 2) * cena.tamanhoCelula,
      custo, ok: custo !== null || this.ehMestre(),
    };
  });

  // marcadores (pontos de interesse)
  readonly marcadores = signal<Marcador[]>([]);
  readonly selecionadoMarcadorId = signal<number | null>(null);
  readonly selecionadoMarcador = computed(() => this.marcadores().find(m => m.marcadorId === this.selecionadoMarcadorId()) ?? null);
  /** Marcador sendo arrastado pelo Mestre: centro em pixels do mundo. */
  readonly arrastoMarcador = signal<{ marcadorId: number; x: number; y: number } | null>(null);
  readonly iconesDeMarcador = ICONES_MARCADOR;

  // desenho livre
  readonly tracos = signal<Traco[]>([]);
  readonly tracoEmCurso = signal<[number, number][] | null>(null);
  readonly corDoTraco = signal<CorToken>('ouro');
  readonly espessuraDoTraco = signal(4);
  readonly espessurasDeTraco = [2, 4, 7, 11];
  readonly tracosDesenhados = computed(() => this.tracos().map(t => ({ ...t, d: this.caminhoDe(t.pontos) })));
  readonly tracoEmCursoD = computed(() => {
    const pontos = this.tracoEmCurso();
    return pontos ? this.caminhoDe(pontos) : null;
  });

  // régua compartilhada
  readonly compartilharRegua = signal(false);
  private reguasAlheias = signal<Record<number, ReguaDeOutro>>({});
  private reguaTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private ultimaReguaEnviada = 0;
  readonly reguasDosOutros = computed(() =>
    Object.values(this.reguasAlheias()).map(r => {
      const quadrados = distanciaEmQuadrados(r.c1, r.l1, r.c2, r.l2);
      return { ...r, quadrados, pes: distanciaEmPes(quadrados) };
    }));

  // condições (edição pelo token)
  readonly condicoesPadrao = CONDICOES;

  // retratos dos tokens (endereços locais das imagens já baixadas)
  readonly retratos = signal<Record<string, string>>({});
  private retratosPedidos = new Set<string>();

  // sessões da campanha, para organizar os mapas
  readonly sessoes = signal<Sessao[]>([]);
  readonly cenasPorSessao = computed(() => {
    const atual = this.sessaoId();
    return { daSessao: this.cenas().filter(c => c.sessaoId === atual), outras: this.cenas().filter(c => c.sessaoId !== atual) };
  });

  readonly painelAberto = signal(true);
  readonly menuCenas = signal(false);
  readonly adicionando = signal(false);

  // combate da sessão (para PV, condições e turno nos tokens)
  readonly combate = signal<any | null>(null);
  private combateConectadoId: number | null = null;
  readonly participantes = computed(() => {
    const mapa = new Map<number, any>();
    for (const p of this.combate()?.participantes ?? []) mapa.set(p.participanteId, p);
    return mapa;
  });
  private participanteDoTurno = computed(() => {
    const c = this.combate();
    return c?.participantes?.[c.turnoAtualIndex]?.participanteId ?? null;
  });

  // personagens da campanha que ainda não estão no mapa (para "Adicionar token")
  readonly personagensDaCampanha = signal<any[]>([]);
  readonly personagensLivres = computed(() => {
    const usados = new Set(this.tokens().map(t => t.personagemId).filter((id): id is number => id !== null));
    return this.personagensDaCampanha().filter(p => !usados.has(p.personagemId));
  });
  readonly opcoesDeVisao = [0, 20, 30, 40, 60, 120];
  novoToken = { personagemId: null as number | null, nome: '', inimigo: false, tamanho: 1, cor: 'ouro' as CorToken, visao: 0 };

  // formulário "Nova cena"
  readonly modalCena = signal(false);
  readonly enviando = signal(false);
  readonly previa = signal<{ arquivo: File; url: string; largura: number; altura: number } | null>(null);
  novaCena = { nome: '', tamanhoCelula: 70 };
  edicaoCena: { nome: string; tamanhoCelula: number; sessaoId: number | null; soNoTurno: boolean; metrosPorQuadrado: number; limitarDeslocamento: boolean } =
    { nome: '', tamanhoCelula: 70, sessaoId: null, soNoTurno: false, metrosPorQuadrado: 1.5, limitarDeslocamento: true };

  /** Fator entre a prévia (largura máxima fixa) e a imagem real, para a grade de calibração. */
  readonly escalaDaPrevia = computed(() => {
    const p = this.previa();
    return p ? Math.min(1, 560 / p.largura) : 1;
  });

  /** Tokens que esta pessoa enxerga, na ordem do combate (ou por nome, sem combate). */
  readonly listaDoPainel = computed(() => {
    const lista = [...this.tokensVisiveis()];
    const ordem = new Map<number, number>();
    (this.combate()?.participantes ?? []).forEach((p: any, i: number) => ordem.set(p.participanteId, i));
    return lista.sort((a, b) => {
      const ia = a.participanteId !== null ? ordem.get(a.participanteId) ?? 999 : 1000;
      const ib = b.participanteId !== null ? ordem.get(b.participanteId) ?? 999 : 1000;
      return ia - ib || a.nome.localeCompare(b.nome, 'pt-BR');
    });
  });

  /**
   * Os círculos de visão (em pixels do mundo): cada token com raio de visão abre a névoa ao redor de si,
   * seguindo o arrasto enquanto ele é movido. Tokens escondidos não enxergam, porque os jogadores nem os recebem.
   */
  readonly fontesDeVisao = computed(() => {
    const cena = this.cena();
    if (!cena) return [];
    const arrasto = this.arrasto();
    return this.tokens()
      .filter(t => t.visao > 0 && !t.oculto)
      .map(t => {
        const lado = t.tamanho * cena.tamanhoCelula;
        const x = arrasto?.tokenId === t.tokenId ? arrasto.x : t.coluna * cena.tamanhoCelula;
        const y = arrasto?.tokenId === t.tokenId ? arrasto.y : t.linha * cena.tamanhoCelula;
        // o raio conta a partir da borda do token
        return { cx: x + lado / 2, cy: y + lado / 2, r: (t.visao / 5) * cena.tamanhoCelula + lado / 2 };
      });
  });

  /** O que cada pessoa enxerga: sob névoa, o jogador não vê tokens alheios fora do que foi revelado ou iluminado. */
  readonly tokensVisiveis = computed(() => {
    const n = this.neblina();
    const cena = this.cena();
    if (!n?.ativa || this.ehMestre() || !cena) return this.tokens();
    const fontes = this.fontesDeVisao();
    const segmentos = this.segmentosDeVisao();
    return this.tokens().filter(t => {
      if (t.donosIds.includes(this.meuId) || areaRevelada(n, t.coluna, t.linha, t.tamanho)) return true;
      const meio = (t.tamanho * cena.tamanhoCelula) / 2;
      const cx = t.coluna * cena.tamanhoCelula + meio;
      const cy = t.linha * cena.tamanhoCelula + meio;
      // dentro do alcance e sem parede no caminho
      return fontes.some(f => Math.hypot(f.cx - cx, f.cy - cy) <= f.r && linhaLivre(f.cx, f.cy, cx, cy, segmentos));
    });
  });

  /** A forma do modelo de área, pronta para o SVG. */
  readonly formaDesenhada = computed(() => {
    const a = this.area();
    const cena = this.cena();
    if (!a || !cena) return null;
    const comprimento = (this.pesDaArea() / 5) * cena.tamanhoCelula;
    const forma = this.formaDeArea();
    if (forma === 'esfera') return { tipo: 'circulo' as const, cx: a.px, cy: a.py, r: comprimento, rotulo: { x: a.px, y: a.py } };

    const angulo = Math.atan2(a.py - a.oy, a.px - a.ox);
    const dx = Math.cos(angulo), dy = Math.sin(angulo);
    const nx = -dy, ny = dx;
    const fx = a.ox + dx * comprimento, fy = a.oy + dy * comprimento;
    // cone do 5e: a largura em qualquer ponto é igual à distância da origem; linha: 1 quadrado de largura
    const meia = forma === 'cone' ? comprimento / 2 : cena.tamanhoCelula / 2;
    const pontos = forma === 'cone'
      ? [[a.ox, a.oy], [fx + nx * meia, fy + ny * meia], [fx - nx * meia, fy - ny * meia]]
      : [[a.ox + nx * meia, a.oy + ny * meia], [fx + nx * meia, fy + ny * meia], [fx - nx * meia, fy - ny * meia], [a.ox - nx * meia, a.oy - ny * meia]];
    return { tipo: 'poligono' as const, pontos: pontos.map(([x, y]) => x + ',' + y).join(' '), rotulo: { x: (a.ox + fx) / 2, y: (a.oy + fy) / 2 } };
  });

  readonly medida = computed(() => {
    const r = this.regua();
    if (!r) return null;
    const quadrados = distanciaEmQuadrados(r.c1, r.l1, r.c2, r.l2);
    return { quadrados, pes: distanciaEmPes(quadrados) };
  });

  // ---------- gestos ----------
  private ponteiros = new Map<number, { x: number; y: number }>();
  private gesto: Gesto | null = null;
  private observador?: ResizeObserver;
  private desconectarHub?: () => Promise<void>;
  private cargaDaCena = 0;

  constructor() {
    effect(() => this.desenharNeblina());
    effect(() => this.carregarRetratos());
    effect(() => this.desenharAlcance());
  }

  ngOnInit(): void {
    void this.iniciar();
  }

  ngAfterViewInit(): void {
    const palco = this.palco()?.nativeElement;
    if (!palco) return;
    // o zoom pela roda precisa cancelar a rolagem da página, o que só um ouvinte não passivo consegue
    palco.addEventListener('wheel', this.aoGirarRoda, { passive: false });
    this.observador = new ResizeObserver(() => {
      if (this.cena() && !this.vistaAjustada) this.centralizar();
    });
    this.observador.observe(palco);
  }

  ngOnDestroy(): void {
    this.palco()?.nativeElement.removeEventListener('wheel', this.aoGirarRoda);
    this.observador?.disconnect();
    this.limparReguasAlheias();
    void this.desconectarHub?.();
    this.liberarImagem();
    this.liberarPrevia();
    Object.values(this.retratos()).forEach(url => URL.revokeObjectURL(url));
    if (this.combateConectadoId !== null) this.combateService.stopConnection(this.combateConectadoId);
    this.combateService.stopSessaoConnection(this.sessaoId());
  }

  private vistaAjustada = false;

  private async iniciar(): Promise<void> {
    try {
      const papel = await firstValueFrom(this.papelService.papelNaCampanha(this.campanhaId()));
      this.papel.set(papel ?? 'Jogador');
      await this.recarregarCenas();
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível abrir o mapa.');
    } finally {
      this.carregando.set(false);
    }

    void this.conectarAoMapa();
    void this.carregarCombate();
    if (this.ehMestre()) {
      void this.carregarPersonagens();
      void this.carregarMembros();
      void this.carregarSessoes();
    }
  }

  private async conectarAoMapa(): Promise<void> {
    try {
      this.desconectarHub = await this.cenaService.conectar(this.campanhaId(), {
        cenaAtualizada: () => void this.recarregarCenas(),
        tokenAtualizado: t => this.aoTokenAtualizado(t),
        tokenMovido: m => this.aoTokenMovido(m),
        tokenRemovido: r => {
          if (r.cenaId === this.cenaId()) this.tokens.update(l => l.filter(t => t.tokenId !== r.tokenId));
        },
        neblinaAlterada: n => {
          if (n.cenaId !== this.cenaId()) return;
          this.neblina.update(atual => atual && aplicarRetangulo(atual, n, n.revelar));
        },
        marcadorAtualizado: m => {
          if (m.cenaId !== this.cenaId()) return;
          this.marcadores.update(l => (l.some(x => x.marcadorId === m.marcadorId) ? l.map(x => (x.marcadorId === m.marcadorId ? m : x)) : [...l, m]));
        },
        marcadorRemovido: r => {
          if (r.cenaId !== this.cenaId()) return;
          this.marcadores.update(l => l.filter(m => m.marcadorId !== r.marcadorId));
          if (this.selecionadoMarcadorId() === r.marcadorId) this.selecionadoMarcadorId.set(null);
        },
        tracoCriado: t => {
          if (t.cenaId === this.cenaId()) this.tracos.update(l => (l.some(x => x.tracoId === t.tracoId) ? l : [...l, t]));
        },
        tracoRemovido: r => { if (r.cenaId === this.cenaId()) this.tracos.update(l => l.filter(t => t.tracoId !== r.tracoId)); },
        tracosLimpos: r => { if (r.cenaId === this.cenaId()) this.tracos.set([]); },
        reguaCompartilhada: r => this.aoReguaDeOutro(r),
        paredesAtualizadas: r => { if (r.cenaId === this.cenaId()) void this.recarregarParedes(); },
        neblinaAtualizada: n => { if (n.cenaId === this.cenaId()) void this.recarregarNeblina(); },
        ping: p => this.mostrarPing(p),
        reconectou: () => { this.conectado.set(true); void this.recarregarCenas(); },
      });
      this.conectado.set(true);
    } catch {
      this.conectado.set(false);
      this.toast.erro('Sem conexão em tempo real com a mesa: o mapa não vai atualizar sozinho.');
    }
  }

  private async carregarPersonagens(): Promise<void> {
    try {
      const todos = await firstValueFrom(this.personagemService.getAll());
      this.personagensDaCampanha.set(todos.filter((p: any) => p.campanhaId == this.campanhaId()));
    } catch { /* o Mestre ainda pode criar tokens avulsos */ }
  }

  // ---------- cenas ----------

  async recarregarCenas(): Promise<void> {
    const cenas = await this.cenaService.listar(this.campanhaId());
    this.cenas.set(cenas);

    const atual = this.cenaId();
    const emJogo = cenas.find(c => c.ativa) ?? null;
    // O Mestre fica na cena que escolheu enquanto ela existir; o jogador sempre acompanha a cena em jogo.
    const destino = this.ehMestre() && cenas.some(c => c.cenaId === atual) ? atual : (emJogo?.cenaId ?? cenas[0]?.cenaId ?? null);

    const mudou = destino !== atual;
    this.cenaId.set(destino);
    const cena = this.cena();
    if (destino === null || !cena) {
      this.tokens.set([]);
      this.liberarImagem();
      return;
    }
    this.edicaoCena = {
      nome: cena.nome, tamanhoCelula: cena.tamanhoCelula, sessaoId: cena.sessaoId, soNoTurno: cena.soNoTurno,
      metrosPorQuadrado: cena.metrosPorQuadrado, limitarDeslocamento: cena.limitarDeslocamento,
    };
    if (mudou || !this.imagemUrl() || this.versaoDaImagem !== `${cena.cenaId}-${cena.imagemVersao}`) {
      await this.carregarCena(cena);
    }
  }

  private versaoDaImagem = '';

  private async carregarCena(cena: Cena): Promise<void> {
    const carga = ++this.cargaDaCena;
    this.selecionadoId.set(null);
    this.regua.set(null);
    try {
      const [tokens, url, neblina, paredes, marcadores, tracos] = await Promise.all([
        this.cenaService.tokens(this.campanhaId(), cena.cenaId),
        this.cenaService.imagem(this.campanhaId(), cena.cenaId),
        this.cenaService.neblina(this.campanhaId(), cena.cenaId),
        this.cenaService.paredes(this.campanhaId(), cena.cenaId),
        this.cenaService.marcadores(this.campanhaId(), cena.cenaId),
        this.cenaService.tracos(this.campanhaId(), cena.cenaId),
      ]);
      if (carga !== this.cargaDaCena) { URL.revokeObjectURL(url); return; } // o usuário já foi para outra cena
      this.liberarImagem();
      this.imagemUrl.set(url);
      this.versaoDaImagem = `${cena.cenaId}-${cena.imagemVersao}`;
      this.tokens.set(tokens);
      this.neblina.set(this.lerNeblina(neblina));
      this.paredes.set(paredes);
      this.marcadores.set(marcadores);
      this.tracos.set(tracos);
      this.selecionadoMarcadorId.set(null);
      this.limparReguasAlheias();
      this.pings.set([]);
      this.vistaAjustada = false;
      // espera o palco ter tamanho antes de enquadrar
      requestAnimationFrame(() => this.centralizar());
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível carregar o mapa.');
    }
  }

  async escolherCena(cenaId: number): Promise<void> {
    this.menuCenas.set(false);
    if (cenaId === this.cenaId()) return;
    this.cenaId.set(cenaId);
    const cena = this.cena();
    if (cena) {
      this.edicaoCena = {
      nome: cena.nome, tamanhoCelula: cena.tamanhoCelula, sessaoId: cena.sessaoId, soNoTurno: cena.soNoTurno,
      metrosPorQuadrado: cena.metrosPorQuadrado, limitarDeslocamento: cena.limitarDeslocamento,
    };
      await this.carregarCena(cena);
    }
  }

  async ativarCena(cena: Cena): Promise<void> {
    try {
      await this.cenaService.ativar(this.campanhaId(), cena.cenaId);
      this.cenaId.set(cena.cenaId);
      await this.recarregarCenas();
      this.toast.ok(`“${cena.nome}” está em jogo: os jogadores já veem este mapa.`);
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível trocar a cena em jogo.');
    }
  }

  async excluirCena(cena: Cena): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Excluir cena',
      mensagem: `Excluir “${cena.nome}” com a imagem e todos os tokens dela?`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await this.cenaService.excluir(this.campanhaId(), cena.cenaId);
      if (this.cenaId() === cena.cenaId) this.cenaId.set(null);
      await this.recarregarCenas();
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível excluir a cena.');
    }
  }

  async salvarGrade(): Promise<void> {
    const cena = this.cena();
    if (!cena || !this.edicaoCena.nome.trim()) return;
    try {
      await this.cenaService.editar(this.campanhaId(), cena.cenaId, {
        nome: this.edicaoCena.nome.trim(),
        tamanhoCelula: Math.round(this.edicaoCena.tamanhoCelula),
        sessaoId: this.edicaoCena.sessaoId,
        soNoTurno: this.edicaoCena.soNoTurno,
        metrosPorQuadrado: Number(this.edicaoCena.metrosPorQuadrado) || 1.5,
        limitarDeslocamento: this.edicaoCena.limitarDeslocamento,
      });
      await this.recarregarCenas();
      this.toast.ok('Cena atualizada.');
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível salvar a cena.');
    }
  }

  // ---------- nova cena ----------

  abrirNovaCena(): void {
    this.menuCenas.set(false);
    this.novaCena = { nome: '', tamanhoCelula: 70 };
    this.liberarPrevia();
    this.modalCena.set(true);
  }

  fecharNovaCena(): void {
    this.modalCena.set(false);
    this.liberarPrevia();
  }

  escolherArquivo(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) { this.toast.erro('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) { this.toast.erro('A imagem do mapa precisa ter até 8 MB.'); return; }

    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 16000 || img.naturalHeight > 16000) {
        URL.revokeObjectURL(url);
        this.toast.erro('A imagem passa de 16000 pixels de lado. Reduza e tente de novo.');
        return;
      }
      this.liberarPrevia();
      this.previa.set({ arquivo, url, largura: img.naturalWidth, altura: img.naturalHeight });
      if (!this.novaCena.nome.trim()) this.novaCena.nome = arquivo.name.replace(/\.[^.]+$/, '').slice(0, 80);
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toast.erro('Não foi possível ler esta imagem.'); };
    img.src = url;
  }

  async criarCena(): Promise<void> {
    const previa = this.previa();
    if (!previa || !this.novaCena.nome.trim() || this.enviando()) return;
    this.enviando.set(true);
    try {
      const criada = await this.cenaService.criar(this.campanhaId(), {
        nome: this.novaCena.nome.trim(),
        largura: previa.largura,
        altura: previa.altura,
        tamanhoCelula: Math.round(this.novaCena.tamanhoCelula),
        imagem: previa.arquivo,
        sessaoId: this.sessaoId(),
      });
      this.fecharNovaCena();
      this.cenaId.set(criada.cenaId);
      await this.recarregarCenas();
      this.toast.ok(criada.ativa ? 'Mapa criado e já em jogo.' : 'Mapa criado. Ative-o quando quiser mostrá-lo aos jogadores.');
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível criar a cena.');
    } finally {
      this.enviando.set(false);
    }
  }

  // ---------- tokens ----------

  podeMover(token: TokenCena): boolean {
    return this.ehMestre() || (!token.oculto && !!this.cena()?.ativa && token.donosIds.includes(this.meuId) && this.naVez(token));
  }

  /** Com "só no turno" ligado e um combate em andamento, só o token de quem está na vez se move. */
  naVez(token: TokenCena): boolean {
    if (!this.cena()?.soNoTurno || token.participanteId === null || !this.combate()) return true;
    // um combatente que não está no combate mostrado (o dele já acabou) não tem vez a respeitar
    if (!this.participantes().has(token.participanteId)) return true;
    const atual = this.participanteDoTurno();
    return atual === null || atual === token.participanteId;
  }

  /** O retrato do token, se já foi baixado. */
  retratoDe(token: TokenCena): string | null {
    return token.imagemVersao > 0 ? this.retratos()[token.tokenId + '-' + token.imagemVersao] ?? null : null;
  }

  info(token: TokenCena): InfoDeCombate | null {
    if (token.participanteId === null) return null;
    const p = this.participantes().get(token.participanteId);
    if (!p) return null;
    const veDetalhes = this.ehMestre() || !p.isInimigo || token.donosIds.includes(this.meuId);
    const abatido = p.isInimigo ? p.vidaAtual <= 0 : p.falhasMorte >= 3;
    return {
      turno: this.participanteDoTurno() === token.participanteId,
      abatido,
      vida: veDetalhes && p.vidaMaxima > 0
        ? { atual: p.vidaAtual, maxima: p.vidaMaxima, pct: Math.max(0, Math.min(100, (p.vidaAtual / p.vidaMaxima) * 100)) }
        : null,
      condicoes: veDetalhes ? lerCondicoes(p.condicoes) : [],
    };
  }

  iniciais = iniciais;

  /** Posição do token na tela do mundo: durante o arrasto, onde o dedo está; senão, no quadrado. */
  posicao(token: TokenCena): { x: number; y: number } {
    const a = this.arrasto();
    const celula = this.cena()?.tamanhoCelula ?? 70;
    return a?.tokenId === token.tokenId ? { x: a.x, y: a.y } : { x: token.coluna * celula, y: token.linha * celula };
  }

  selecionar(token: TokenCena, centralizar = false): void {
    this.selecionadoId.set(token.tokenId);
    this.selecionadoMarcadorId.set(null);
    if (centralizar) this.centralizarEm(token);
  }

  abrirAdicionar(): void {
    this.novoToken = { personagemId: null, nome: '', inimigo: false, tamanho: 1, cor: 'ouro', visao: 0 };
    this.adicionando.set(true);
    this.painelAberto.set(true);
  }

  /** Um token de luz que o Mestre move à mão: a névoa se abre numa área só, onde ele quiser. */
  prepararFocoDeLuz(): void {
    this.novoToken = { personagemId: null, nome: 'Foco de luz', inimigo: false, tamanho: 1, cor: 'ouro', visao: 30 };
  }

  escolheuPersonagem(): void {
    const p = this.personagensDaCampanha().find(x => x.personagemId === this.novoToken.personagemId);
    if (!p) return;
    this.novoToken.nome = p.nome;
    this.novoToken.inimigo = p.tipoId === 3;
    this.novoToken.cor = p.tipoId === 3 ? 'carmim' : p.tipoId === 2 ? 'violeta' : 'azul';
  }

  async adicionarToken(): Promise<void> {
    const cena = this.cena();
    const palco = this.palco()?.nativeElement;
    if (!cena || !palco || !this.novoToken.nome.trim()) return;

    // no centro do que se está vendo, no primeiro quadrado que cabe
    const centro = telaParaMundo(this.vista(), palco.clientWidth / 2, palco.clientHeight / 2);
    const q = quadradoEm(centro.x, centro.y, cena.tamanhoCelula);
    const pos = limitarAoMapa(q.coluna, q.linha, this.novoToken.tamanho, cena.largura, cena.altura, cena.tamanhoCelula);
    try {
      const criado = await this.cenaService.criarToken(this.campanhaId(), cena.cenaId, {
        nome: this.novoToken.nome.trim(), coluna: pos.coluna, linha: pos.linha, tamanho: this.novoToken.tamanho,
        cor: this.novoToken.cor, inimigo: this.novoToken.inimigo, oculto: false, visao: this.novoToken.visao, personagemId: this.novoToken.personagemId,
      });
      this.aoTokenAtualizado(criado);
      this.selecionadoId.set(criado.tokenId);
      this.adicionando.set(false);
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível adicionar o token.');
    }
  }

  async trazerCombatentes(): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      const novos = await this.cenaService.tokensDoCombate(this.campanhaId(), cena.cenaId, this.sessaoId());
      novos.forEach(t => this.aoTokenAtualizado(t));
      this.toast.ok(novos.length ? `${novos.length} combatente(s) no mapa.` : 'Todos os combatentes já estão no mapa.');
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível trazer os combatentes.');
    }
  }

  /** Aplica uma mudança no token selecionado (nome, cor, tamanho, escondido...). */
  async alterarToken(token: TokenCena, mudanca: Partial<TokenForm>): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const form: TokenForm = {
      nome: token.nome, coluna: token.coluna, linha: token.linha, tamanho: token.tamanho, cor: token.cor,
      inimigo: token.inimigo, oculto: token.oculto, visao: token.visao, personagemId: token.personagemId,
      participanteId: token.participanteId, controladoPorId: token.controladoPorId, deslocamentoMetros: token.deslocamentoManual,
      ...mudanca,
    };
    if (!form.nome.trim()) return;
    try {
      this.aoTokenAtualizado(await this.cenaService.editarToken(this.campanhaId(), cena.cenaId, token.tokenId, form));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível alterar o token.');
    }
  }

  async removerToken(token: TokenCena): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      await this.cenaService.excluirToken(this.campanhaId(), cena.cenaId, token.tokenId);
      this.tokens.update(l => l.filter(t => t.tokenId !== token.tokenId));
      this.selecionadoId.set(null);
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível remover o token.');
    }
  }

  private aoTokenAtualizado(token: TokenCena): void {
    if (token.cenaId !== this.cenaId()) return;
    this.tokens.update(lista =>
      lista.some(t => t.tokenId === token.tokenId)
        ? lista.map(t => (t.tokenId === token.tokenId ? token : t))
        : [...lista, token]);
  }

  private aoTokenMovido(m: MovimentoToken): void {
    if (m.cenaId !== this.cenaId()) return;
    this.tokens.update(lista => lista.map(t => (t.tokenId === m.tokenId
      ? { ...t, coluna: m.coluna, linha: m.linha, movimentoGasto: m.movimentoGasto ?? t.movimentoGasto, movimentoTurno: m.movimentoTurno === undefined ? t.movimentoTurno : m.movimentoTurno }
      : t)));
  }

  /** Move com uma resposta imediata na tela; se o servidor recusar, o token volta para onde estava. */
  private async moverToken(token: TokenCena, coluna: number, linha: number): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const destino = limitarAoMapa(coluna, linha, token.tamanho, cena.largura, cena.altura, cena.tamanhoCelula);
    if (destino.coluna === token.coluna && destino.linha === token.linha) return;

    if (!this.ehMestre()) {
      // o caminho é de verdade (contorna paredes) e, em combate, custa do deslocamento da rodada; o servidor confere de novo
      const orcamento = this.orcamentoDe(token);
      const limite = orcamento?.emCombate ? orcamento.restante : Number.POSITIVE_INFINITY;
      const grade = { colunas: Math.max(1, Math.floor(cena.largura / cena.tamanhoCelula)), linhas: Math.max(1, Math.floor(cena.altura / cena.tamanhoCelula)) };
      const paredes = this.barreirasEmQuadrados();
      const custo = custoAte(grade, token.tamanho, token.coluna, token.linha, destino.coluna, destino.linha, paredes, limite);
      if (custo === null) {
        const existe = Number.isFinite(limite) && custoAte(grade, token.tamanho, token.coluna, token.linha, destino.coluna, destino.linha, paredes) !== null;
        this.toast.erro(existe
          ? 'Deslocamento insuficiente: restam ' + limite + ' quadrado(s) (' + this.fmtM(limite * this.metrosPorQuadrado()) + ' m).'
          : 'Há uma parede no caminho.');
        return;
      }
    }

    const antes = { coluna: token.coluna, linha: token.linha };
    this.aoTokenMovido({ tokenId: token.tokenId, cenaId: token.cenaId, ...destino });
    try {
      await this.cenaService.mover(token.tokenId, destino.coluna, destino.linha);
    } catch (erro) {
      this.aoTokenMovido({ tokenId: token.tokenId, cenaId: token.cenaId, ...antes });
      this.toast.erro(this.mensagemDoHub(erro) ?? 'Não foi possível mover o token.');
    }
  }

  aoTeclaNoToken(evento: KeyboardEvent, token: TokenCena): void {
    const passos: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); this.selecionar(token); return; }
    const passo = passos[evento.key];
    if (!passo) return;
    evento.preventDefault();
    this.selecionar(token);
    if (this.podeMover(token)) void this.moverToken(token, token.coluna + passo[0], token.linha + passo[1]);
  }

  // ---------- câmera ----------

  centralizar(): void {
    const palco = this.palco()?.nativeElement;
    const cena = this.cena();
    if (!palco || !cena || palco.clientWidth === 0) return;
    this.vista.set(ajustarAoPalco(palco.clientWidth, palco.clientHeight, cena.largura, cena.altura));
    this.vistaAjustada = true;
  }

  private centralizarEm(token: TokenCena): void {
    const palco = this.palco()?.nativeElement;
    const cena = this.cena();
    if (!palco || !cena) return;
    const v = this.vista();
    const zoom = limitarZoom(Math.max(v.zoom, 0.8));
    const meio = (token.tamanho * cena.tamanhoCelula) / 2;
    this.vista.set({
      zoom,
      x: palco.clientWidth / 2 - (token.coluna * cena.tamanhoCelula + meio) * zoom,
      y: palco.clientHeight / 2 - (token.linha * cena.tamanhoCelula + meio) * zoom,
    });
  }

  ampliar(fator: number): void {
    const palco = this.palco()?.nativeElement;
    if (!palco) return;
    const v = this.vista();
    this.vista.set(zoomEmTorno(v, v.zoom * fator, palco.clientWidth / 2, palco.clientHeight / 2));
  }

  private aoGirarRoda = (evento: WheelEvent): void => {
    evento.preventDefault();
    const palco = this.palco()?.nativeElement;
    if (!palco) return;
    const caixa = palco.getBoundingClientRect();
    const v = this.vista();
    this.vista.set(zoomEmTorno(v, v.zoom * Math.exp(-evento.deltaY * 0.0015), evento.clientX - caixa.left, evento.clientY - caixa.top));
  };

  // ---------- ponteiros (mouse, toque e caneta) ----------

  private posDoPonteiro(evento: PointerEvent): { x: number; y: number } {
    const caixa = this.palco()!.nativeElement.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  aoApertarFundo(evento: PointerEvent): void {
    const palco = this.palco()?.nativeElement;
    const cena = this.cena();
    if (!palco || !cena) return;
    palco.setPointerCapture(evento.pointerId);
    const pos = this.posDoPonteiro(evento);
    this.ponteiros.set(evento.pointerId, pos);

    if (this.ponteiros.size === 2) {
      this.arrasto.set(null);
      this.iniciarPinca();
      return;
    }
    const ferramenta = this.ferramenta();
    if ((ferramenta === 'revelar' || ferramenta === 'cobrir') && this.ehMestre()) {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const q = quadradoEm(m.x, m.y, cena.tamanhoCelula);
      this.retanguloNeblina.set({ c1: q.coluna, l1: q.linha, c2: q.coluna, l2: q.linha });
      this.gesto = { tipo: 'neblina', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    if (ferramenta === 'marcador' && this.ehMestre()) {
      void this.criarMarcadorEm(pos.x, pos.y);
      return;
    }
    if (ferramenta === 'desenhar') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.tracoEmCurso.set([[m.x, m.y]]);
      this.gesto = { tipo: 'desenho', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    if (ferramenta === 'borracha') {
      void this.apagarTracoEm(pos.x, pos.y);
      return;
    }
    if ((ferramenta === 'parede' || ferramenta === 'porta' || ferramenta === 'janela') && this.ehMestre()) {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const x = Math.round(m.x / cena.tamanhoCelula);
      const y = Math.round(m.y / cena.tamanhoCelula);
      this.paredeEmCurso.set({ x1: x, y1: y, x2: x, y2: y });
      this.gesto = { tipo: 'parede', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    if (ferramenta === 'apagar' && this.ehMestre()) {
      void this.apagarParedeEm(pos.x, pos.y);
      return;
    }
    if (ferramenta === 'area') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const ox = Math.round(m.x / cena.tamanhoCelula) * cena.tamanhoCelula;
      const oy = Math.round(m.y / cena.tamanhoCelula) * cena.tamanhoCelula;
      this.area.set({ ox, oy, px: this.formaDeArea() === 'esfera' ? ox : m.x, py: this.formaDeArea() === 'esfera' ? oy : m.y });
      this.gesto = { tipo: 'area', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    if (ferramenta === 'regua') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const q = quadradoEm(m.x, m.y, cena.tamanhoCelula);
      this.regua.set({ c1: q.coluna, l1: q.linha, c2: q.coluna, l2: q.linha });
      this.compartilharAMinhaRegua(true);
      this.gesto = { tipo: 'regua', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    this.gesto = { tipo: 'pan', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
    // segurar sem mexer vira um "olhem aqui" para a mesa inteira
    this.cancelarToqueLongo();
    this.toqueLongo = setTimeout(() => {
      const g = this.gesto;
      if (g?.tipo === 'pan' && !g.moveu && this.ponteiros.size === 1) {
        g.moveu = true;
        this.fazerPing(pos.x, pos.y);
      }
    }, TOQUE_LONGO_MS);
  }

  aoApertarToken(evento: PointerEvent, token: TokenCena): void {
    const cena = this.cena();
    const palco = this.palco()?.nativeElement;
    if (!cena || !palco || this.ferramenta() !== 'mover') return; // com a régua, o clique atravessa para o fundo
    evento.stopPropagation();
    palco.setPointerCapture(evento.pointerId);
    const pos = this.posDoPonteiro(evento);
    this.ponteiros.set(evento.pointerId, pos);
    this.selecionar(token);

    if (this.ponteiros.size === 2) { this.iniciarPinca(); return; }
    if (!this.podeMover(token)) {
      // não é seu: arrastar leva o mapa, como em qualquer lugar vazio
      this.gesto = { tipo: 'pan', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
      return;
    }
    const m = telaParaMundo(this.vista(), pos.x, pos.y);
    this.gesto = {
      tipo: 'token', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false, tokenId: token.tokenId,
      deslocX: m.x - token.coluna * cena.tamanhoCelula, deslocY: m.y - token.linha * cena.tamanhoCelula,
    };
  }

  aoMoverPonteiro(evento: PointerEvent): void {
    if (!this.ponteiros.has(evento.pointerId) || !this.gesto) return;
    const pos = this.posDoPonteiro(evento);
    this.ponteiros.set(evento.pointerId, pos);
    const g = this.gesto;
    const cena = this.cena();
    if (!cena) return;

    if (g.tipo === 'pinca') {
      const [a, b] = [...this.ponteiros.values()];
      if (!b || !g.distanciaInicial) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const base = g.vistaInicial;
      // zoom pela razão das distâncias e, junto, o mapa acompanha o movimento do centro dos dedos
      const ajustado = zoomEmTorno(base, base.zoom * (dist / g.distanciaInicial), g.inicioX, g.inicioY);
      this.vista.set({ ...ajustado, x: ajustado.x + (centro.x - g.inicioX), y: ajustado.y + (centro.y - g.inicioY) });
      return;
    }

    if (!g.moveu && Math.hypot(pos.x - g.inicioX, pos.y - g.inicioY) < LIMITE_ARRASTO_PX) return;
    g.moveu = true;
    this.cancelarToqueLongo();

    if (g.tipo === 'pan') {
      this.vista.set({ ...g.vistaInicial, x: g.vistaInicial.x + pos.x - g.inicioX, y: g.vistaInicial.y + pos.y - g.inicioY });
    } else if (g.tipo === 'token') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.arrasto.set({ tokenId: g.tokenId!, x: m.x - g.deslocX!, y: m.y - g.deslocY! });
    } else if (g.tipo === 'desenho') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.tracoEmCurso.update(pontos => {
        if (!pontos || pontos.length >= 600) return pontos;
        const [ux, uy] = pontos[pontos.length - 1];
        return Math.hypot(m.x - ux, m.y - uy) * this.vista().zoom >= 4 ? [...pontos, [m.x, m.y]] : pontos;
      });
    } else if (g.tipo === 'marcador') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.arrastoMarcador.set({ marcadorId: g.marcadorId!, x: m.x, y: m.y });
    } else if (g.tipo === 'parede') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.paredeEmCurso.update(p => (p ? { ...p, x2: Math.round(m.x / cena.tamanhoCelula), y2: Math.round(m.y / cena.tamanhoCelula) } : p));
    } else if (g.tipo === 'neblina') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const q = quadradoEm(m.x, m.y, cena.tamanhoCelula);
      this.retanguloNeblina.update(r => (r ? { ...r, c2: q.coluna, l2: q.linha } : r));
    } else if (g.tipo === 'area') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      this.area.update(a => {
        if (!a) return a;
        if (this.formaDeArea() !== 'esfera') return { ...a, px: m.x, py: m.y };
        const celula = cena.tamanhoCelula; // a esfera acompanha o ponteiro, de cruzamento em cruzamento
        return { ...a, px: Math.round(m.x / celula) * celula, py: Math.round(m.y / celula) * celula };
      });
    } else if (g.tipo === 'regua') {
      const m = telaParaMundo(this.vista(), pos.x, pos.y);
      const q = quadradoEm(m.x, m.y, cena.tamanhoCelula);
      this.regua.update(r => (r ? { ...r, c2: q.coluna, l2: q.linha } : r));
      this.compartilharAMinhaRegua();
    }
  }

  aoSoltarPonteiro(evento: PointerEvent): void {
    this.ponteiros.delete(evento.pointerId);
    this.cancelarToqueLongo();
    const g = this.gesto;
    const cena = this.cena();
    if (!g) return;

    if (g.tipo === 'pinca') {
      // sobrando um dedo, ele continua levando o mapa
      const [restante] = [...this.ponteiros.values()];
      this.gesto = restante
        ? { tipo: 'pan', inicioX: restante.x, inicioY: restante.y, vistaInicial: this.vista(), moveu: true }
        : null;
      return;
    }
    this.gesto = null;

    if (g.tipo === 'token' && cena) {
      const arrasto = this.arrasto();
      const token = this.tokens().find(t => t.tokenId === g.tokenId);
      this.arrasto.set(null);
      if (g.moveu && arrasto && token) {
        void this.moverToken(token, Math.round(arrasto.x / cena.tamanhoCelula), Math.round(arrasto.y / cena.tamanhoCelula));
      }
    } else if (g.tipo === 'neblina') {
      const r = this.retanguloNeblina();
      this.retanguloNeblina.set(null);
      if (r) void this.aplicarNeblina(retanguloEntre(r.c1, r.l1, r.c2, r.l2), this.ferramenta() === 'revelar');
    } else if (g.tipo === 'desenho') {
      const pontos = this.tracoEmCurso();
      this.tracoEmCurso.set(null);
      if (pontos && pontos.length >= 2) void this.enviarTraco(pontos);
    } else if (g.tipo === 'marcador' && cena) {
      const arrasto = this.arrastoMarcador();
      const marcador = this.marcadores().find(m => m.marcadorId === g.marcadorId);
      this.arrastoMarcador.set(null);
      if (g.moveu && arrasto && marcador) {
        void this.salvarMarcador(marcador, {
          coluna: Math.max(0, Math.floor(arrasto.x / cena.tamanhoCelula)), linha: Math.max(0, Math.floor(arrasto.y / cena.tamanhoCelula)),
        });
      }
    } else if (g.tipo === 'parede') {
      const p = this.paredeEmCurso();
      this.paredeEmCurso.set(null);
      const f = this.ferramenta();
      if (p && (p.x1 !== p.x2 || p.y1 !== p.y2)) void this.criarParede(p, f === 'porta' ? 'porta' : f === 'janela' ? 'janela' : 'parede');
    } else if (g.tipo === 'pan' && !g.moveu) {
      // clique numa porta: o Mestre abre ou fecha; em qualquer outro vazio, desmarca
      if (this.ehMestre() && this.ferramenta() === 'mover' && this.alternarPortaEm(g.inicioX, g.inicioY)) return;
      this.selecionadoId.set(null);
    }
  }

  aoCancelarPonteiro(evento: PointerEvent): void {
    this.ponteiros.delete(evento.pointerId);
    this.cancelarToqueLongo();
    this.arrasto.set(null);
    this.retanguloNeblina.set(null);
    this.paredeEmCurso.set(null);
    this.tracoEmCurso.set(null);
    this.arrastoMarcador.set(null);
    this.gesto = this.ponteiros.size ? this.gesto : null;
  }

  private iniciarPinca(): void {
    const [a, b] = [...this.ponteiros.values()];
    this.gesto = {
      tipo: 'pinca', moveu: true, vistaInicial: this.vista(),
      inicioX: (a.x + b.x) / 2, inicioY: (a.y + b.y) / 2,
      distanciaInicial: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  }

  escolherFerramenta(f: Ferramenta): void {
    this.ferramenta.set(f);
    if (f !== 'regua') {
      if (this.regua() && this.compartilharRegua()) this.enviarRegua(false);
      this.regua.set(null);
    }
    if (f !== 'area') this.area.set(null);
    if (f !== 'desenhar') this.tracoEmCurso.set(null);
  }

  // ---------- paredes e portas ----------

  private async recarregarParedes(): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      this.paredes.set(await this.cenaService.paredes(this.campanhaId(), cena.cenaId));
    } catch { /* continua com as que já tinha */ }
  }

  private async criarParede(p: { x1: number; y1: number; x2: number; y2: number }, tipo: TipoDeParede): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      const criada = await this.cenaService.criarParede(this.campanhaId(), cena.cenaId, { ...p, porta: tipo === 'porta', aberta: false, janela: tipo === 'janela' });
      this.paredes.update(l => (l.some(x => x.paredeId === criada.paredeId) ? l : [...l, criada]));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível criar a parede.');
    }
  }

  /** A parede ou porta mais perto do ponto da tela (tolerância fixa na tela, qualquer que seja o zoom). */
  private paredePerto(telaX: number, telaY: number, apenasPortas: boolean): Parede | null {
    const cena = this.cena();
    if (!cena) return null;
    const m = telaParaMundo(this.vista(), telaX, telaY);
    const celula = cena.tamanhoCelula;
    const candidatos = this.paredes()
      .filter(p => !apenasPortas || p.porta)
      .map(p => ({ ...p, x1: p.x1 * celula, y1: p.y1 * celula, x2: p.x2 * celula, y2: p.y2 * celula }));
    const achada = maisProximo(m.x, m.y, candidatos, 16 / this.vista().zoom);
    return achada ? this.paredes().find(p => p.paredeId === achada.paredeId) ?? null : null;
  }

  private async apagarParedeEm(telaX: number, telaY: number): Promise<void> {
    const cena = this.cena();
    const parede = this.paredePerto(telaX, telaY, false);
    if (!cena || !parede) return;
    try {
      await this.cenaService.excluirParede(this.campanhaId(), cena.cenaId, parede.paredeId);
      this.paredes.update(l => l.filter(p => p.paredeId !== parede.paredeId));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível apagar a parede.');
    }
  }

  private alternarPortaEm(telaX: number, telaY: number): boolean {
    const cena = this.cena();
    const porta = this.paredePerto(telaX, telaY, true);
    if (!cena || !porta) return false;
    const aberta = !porta.aberta;
    this.paredes.update(l => l.map(p => (p.paredeId === porta.paredeId ? { ...p, aberta } : p)));
    this.cenaService
      .editarParede(this.campanhaId(), cena.cenaId, porta.paredeId, { x1: porta.x1, y1: porta.y1, x2: porta.x2, y2: porta.y2, porta: true, aberta, janela: false })
      .catch(erro => {
        this.paredes.update(l => l.map(p => (p.paredeId === porta.paredeId ? { ...p, aberta: !aberta } : p)));
        this.avisarErro(erro, 'Não foi possível mexer na porta.');
      });
    return true;
  }

  // ---------- deslocamento ----------

  /** Quanto o token pode andar: o total (do token ou da ficha) e, em combate, o que resta na rodada. */
  orcamentoDe(token: TokenCena): { total: number; gasto: number; restante: number; emCombate: boolean } | null {
    const cena = this.cena();
    if (!cena || token.deslocamentoMetros === null) return null;
    const total = quadradosEm(token.deslocamentoMetros, this.metrosPorQuadrado());
    const carimbo = this.carimboAtual();
    const emCombate = cena.limitarDeslocamento && token.participanteId !== null && this.participantes().has(token.participanteId) && !!carimbo;
    const gasto = emCombate && token.movimentoTurno === carimbo ? token.movimentoGasto : 0;
    return { total, gasto, emCombate, restante: emCombate ? Math.max(0, total - gasto) : total };
  }

  /** Metros, no formato da casa ("1,5", "9"). */
  fmtM(valor: number): string {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  /** Quadrados em metros, na escala desta cena. */
  metros(quadrados: number): string {
    return this.fmtM(quadrados * this.metrosPorQuadrado());
  }

  /** Alcance de visão e de áreas guardados em pés (5 pés = 1 quadrado), mostrados em metros. */
  pesParaMetros(pes: number): number {
    return (pes / 5) * this.metrosPorQuadrado();
  }

  /** Pinta o alcance do token selecionado: quadrados azuis com o contorno da região, como nos jogos táticos. */
  private desenharAlcance(): void {
    const canvas = this.canvasAlcance()?.nativeElement;
    const cena = this.cena();
    const a = this.alcanceVisivel();
    this.versaoAlcance.update(v => v + 1); // o 3D usa a mesma canvas como textura
    if (!canvas || !cena) return;

    const escala = Math.min(1, 2048 / Math.max(cena.largura, cena.altura));
    canvas.width = Math.ceil(cena.largura * escala);
    canvas.height = Math.ceil(cena.altura * escala);
    const contexto = canvas.getContext('2d');
    if (!contexto || !a) return;

    const lado = cena.tamanhoCelula * escala;
    const { colunas } = a.grade;
    contexto.fillStyle = 'rgba(58, 145, 235, 0.34)';
    for (const indice of a.cobertos) {
      contexto.fillRect((indice % colunas) * lado, Math.floor(indice / colunas) * lado, lado + 0.5, lado + 0.5);
    }

    // o contorno: só as bordas entre um quadrado alcançável e um que não é
    contexto.strokeStyle = 'rgba(150, 205, 255, 0.95)';
    contexto.lineWidth = Math.max(1.5, 2.5 * escala);
    contexto.lineCap = 'round';
    contexto.beginPath();
    for (const indice of a.cobertos) {
      const c = indice % colunas, l = Math.floor(indice / colunas);
      const x = c * lado, y = l * lado;
      if (!a.cobertos.has(indice - colunas)) { contexto.moveTo(x, y); contexto.lineTo(x + lado, y); }
      if (!a.cobertos.has(indice + colunas)) { contexto.moveTo(x, y + lado); contexto.lineTo(x + lado, y + lado); }
      if (c === 0 || !a.cobertos.has(indice - 1)) { contexto.moveTo(x, y); contexto.lineTo(x, y + lado); }
      if (c === colunas - 1 || !a.cobertos.has(indice + 1)) { contexto.moveTo(x + lado, y); contexto.lineTo(x + lado, y + lado); }
    }
    contexto.stroke();
  }

  // ---------- marcadores ----------

  selecionarMarcador(marcador: Marcador, centralizar = false): void {
    this.selecionadoMarcadorId.set(marcador.marcadorId);
    this.selecionadoId.set(null);
    this.painelAberto.set(true);
    const cena = this.cena();
    const palco = this.palco()?.nativeElement;
    if (centralizar && cena && palco) {
      const zoom = limitarZoom(Math.max(this.vista().zoom, 0.8));
      this.vista.set({
        zoom,
        x: palco.clientWidth / 2 - (marcador.coluna + 0.5) * cena.tamanhoCelula * zoom,
        y: palco.clientHeight / 2 - (marcador.linha + 0.5) * cena.tamanhoCelula * zoom,
      });
    }
  }

  iconeDoMarcador(chave: string): string {
    return this.iconesDeMarcador.find(i => i.chave === chave)?.icone ?? 'bi-geo-alt-fill';
  }

  /** Centro do marcador, em pixels do mundo (acompanha o arrasto do Mestre). */
  posicaoDoMarcador(m: Marcador): { x: number; y: number } {
    const a = this.arrastoMarcador();
    const celula = this.cena()?.tamanhoCelula ?? 70;
    return a?.marcadorId === m.marcadorId ? { x: a.x, y: a.y } : { x: (m.coluna + 0.5) * celula, y: (m.linha + 0.5) * celula };
  }

  aoApertarMarcador(evento: PointerEvent, marcador: Marcador): void {
    const palco = this.palco()?.nativeElement;
    const cena = this.cena();
    if (!palco || !cena || this.ferramenta() !== 'mover') return;
    evento.stopPropagation();
    palco.setPointerCapture(evento.pointerId);
    const pos = this.posDoPonteiro(evento);
    this.ponteiros.set(evento.pointerId, pos);
    this.selecionarMarcador(marcador);

    if (this.ponteiros.size === 2) { this.iniciarPinca(); return; }
    this.gesto = this.ehMestre()
      ? { tipo: 'marcador', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false, marcadorId: marcador.marcadorId }
      : { tipo: 'pan', inicioX: pos.x, inicioY: pos.y, vistaInicial: this.vista(), moveu: false };
  }

  private async criarMarcadorEm(telaX: number, telaY: number): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const m = telaParaMundo(this.vista(), telaX, telaY);
    const q = quadradoEm(m.x, m.y, cena.tamanhoCelula);
    try {
      const criado = await this.cenaService.criarMarcador(this.campanhaId(), cena.cenaId, {
        coluna: q.coluna, linha: q.linha, icone: 'pino', titulo: 'Novo marcador', nota: '', visivel: false,
      });
      this.marcadores.update(l => (l.some(x => x.marcadorId === criado.marcadorId) ? l : [...l, criado]));
      this.selecionarMarcador(criado);
      this.escolherFerramenta('mover');
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível criar o marcador.');
    }
  }

  async salvarMarcador(marcador: Marcador, mudanca: Partial<MarcadorForm>): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const form: MarcadorForm = {
      coluna: marcador.coluna, linha: marcador.linha, icone: marcador.icone, titulo: marcador.titulo, nota: marcador.nota,
      visivel: marcador.visivel, ...mudanca,
    };
    if (!form.titulo.trim()) return;
    try {
      const salvo = await this.cenaService.editarMarcador(this.campanhaId(), cena.cenaId, marcador.marcadorId, form);
      this.marcadores.update(l => l.map(x => (x.marcadorId === salvo.marcadorId ? salvo : x)));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível salvar o marcador.');
    }
  }

  async removerMarcador(marcador: Marcador): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      await this.cenaService.excluirMarcador(this.campanhaId(), cena.cenaId, marcador.marcadorId);
      this.marcadores.update(l => l.filter(m => m.marcadorId !== marcador.marcadorId));
      this.selecionadoMarcadorId.set(null);
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível remover o marcador.');
    }
  }

  // ---------- desenho livre ----------

  private caminhoDe(pontos: [number, number][]): string {
    return pontos.map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  }

  private async enviarTraco(pontos: [number, number][]): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      const criado = await this.cenaService.criarTraco(this.campanhaId(), cena.cenaId, {
        cor: this.corDoTraco(), espessura: this.espessuraDoTraco(), pontos,
      });
      this.tracos.update(l => (l.some(t => t.tracoId === criado.tracoId) ? l : [...l, criado]));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível salvar o desenho.');
    }
  }

  /** Apaga o traço mais perto do ponto da tela: cada um apaga o seu; o Mestre, qualquer um. */
  private async apagarTracoEm(telaX: number, telaY: number): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const m = telaParaMundo(this.vista(), telaX, telaY);
    const tolerancia = 16 / this.vista().zoom;
    let alvo: Traco | null = null;
    let menor = tolerancia;
    for (const t of this.tracos()) {
      const segmentos: Segmento[] = [];
      for (let i = 1; i < t.pontos.length; i++) {
        segmentos.push({ x1: t.pontos[i - 1][0], y1: t.pontos[i - 1][1], x2: t.pontos[i][0], y2: t.pontos[i][1] });
      }
      const perto = maisProximo(m.x, m.y, segmentos, menor);
      if (!perto) continue;
      alvo = t;
      menor = tolerancia; // achou um: os próximos só valem se estiverem na mesma tolerância
      break;
    }
    if (!alvo) return;
    if (!this.ehMestre() && alvo.usuarioId !== this.meuId) { this.toast.info('Você só apaga o que desenhou.'); return; }
    try {
      await this.cenaService.excluirTraco(this.campanhaId(), cena.cenaId, alvo.tracoId);
      this.tracos.update(l => l.filter(t => t.tracoId !== alvo!.tracoId));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível apagar o traço.');
    }
  }

  async limparTracos(): Promise<void> {
    const cena = this.cena();
    if (!cena || !this.tracos().length) return;
    const ok = await this.confirm.confirmar({
      titulo: 'Limpar desenhos', mensagem: 'Apagar todos os desenhos deste mapa, de todos os jogadores?', confirmar: 'Limpar', perigo: true,
    });
    if (!ok) return;
    try {
      await this.cenaService.limparTracos(this.campanhaId(), cena.cenaId);
      this.tracos.set([]);
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível limpar os desenhos.');
    }
  }

  // ---------- régua compartilhada ----------

  alternarCompartilharRegua(): void {
    const ligar = !this.compartilharRegua();
    this.compartilharRegua.set(ligar);
    if (this.regua()) this.enviarRegua(ligar);
  }

  private compartilharAMinhaRegua(forcar = false): void {
    if (!this.compartilharRegua()) return;
    const agora = Date.now();
    if (!forcar && agora - this.ultimaReguaEnviada < 60) return;
    this.ultimaReguaEnviada = agora;
    this.enviarRegua(true);
  }

  private enviarRegua(ativa: boolean): void {
    const cena = this.cena();
    const r = this.regua();
    if (!cena) return;
    this.cenaService.regua(cena.cenaId, r?.c1 ?? 0, r?.l1 ?? 0, r?.c2 ?? 0, r?.l2 ?? 0, ativa && !!r).catch(() => undefined);
  }

  private aoReguaDeOutro(r: ReguaDeOutro): void {
    if (r.cenaId !== this.cenaId()) return;
    clearTimeout(this.reguaTimers.get(r.usuarioId));
    if (!r.ativa) {
      this.reguaTimers.delete(r.usuarioId);
      this.reguasAlheias.update(m => { const { [r.usuarioId]: _, ...resto } = m; return resto; });
      return;
    }
    this.reguasAlheias.update(m => ({ ...m, [r.usuarioId]: r }));
    // se a pessoa some sem desligar (fechou a aba), a régua dela não fica para sempre
    this.reguaTimers.set(r.usuarioId, setTimeout(() => this.aoReguaDeOutro({ ...r, ativa: false }), 8000));
  }

  private limparReguasAlheias(): void {
    this.reguaTimers.forEach(t => clearTimeout(t));
    this.reguaTimers.clear();
    this.reguasAlheias.set({});
  }

  // ---------- condições pelo token ----------

  podeEditarCondicoes(token: TokenCena): boolean {
    if (token.participanteId === null || !this.participantes().has(token.participanteId)) return false;
    return this.ehMestre() || (token.donosIds.includes(this.meuId) && token.personagemId !== null);
  }

  temCondicaoNoToken(token: TokenCena, nome: string): boolean {
    return token.participanteId !== null && temCondicao(this.participantes().get(token.participanteId)?.condicoes, nome);
  }

  async alternarCondicaoDoToken(token: TokenCena, nome: string): Promise<void> {
    const combate = this.combate();
    const p = token.participanteId !== null ? this.participantes().get(token.participanteId) : undefined;
    if (!combate || !p) return;
    const condicoes = alternarCondicao(p.condicoes, nome);
    // resposta imediata; o combate confirma (e corrige, se o servidor recusar) logo depois
    this.combate.update(c => c && { ...c, participantes: c.participantes.map((x: any) => (x.participanteId === p.participanteId ? { ...x, condicoes } : x)) });
    try {
      await firstValueFrom(this.combateService.updateParticipante(combate.combateId, p.participanteId, {
        vidaAtual: p.vidaAtual, condicoes, sucessosMorte: p.sucessosMorte || 0, falhasMorte: p.falhasMorte || 0,
      }));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível mudar a condição.');
      void this.carregarCombate();
    }
  }

  // ---------- retratos ----------

  private carregarRetratos(): void {
    const cena = this.cena();
    if (!cena) return;
    for (const t of this.tokens()) {
      if (t.imagemVersao === 0) continue;
      const chave = t.tokenId + '-' + t.imagemVersao;
      if (this.retratosPedidos.has(chave)) continue;
      this.retratosPedidos.add(chave);
      this.cenaService.retrato(this.campanhaId(), cena.cenaId, t.tokenId)
        .then(url => this.retratos.update(r => ({ ...r, [chave]: url })))
        .catch(() => this.retratosPedidos.delete(chave));
    }
  }

  async trocarRetrato(token: TokenCena, evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    const cena = this.cena();
    if (!arquivo || !cena) return;
    if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) { this.toast.erro('Use uma imagem PNG, JPG ou WebP.'); return; }
    try {
      const pronto = await prepararRetrato(arquivo);
      this.aoTokenAtualizado(await this.cenaService.enviarRetrato(this.campanhaId(), cena.cenaId, token.tokenId, pronto));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível enviar o retrato.');
    }
  }

  async removerRetrato(token: TokenCena): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      this.aoTokenAtualizado(await this.cenaService.removerRetrato(this.campanhaId(), cena.cenaId, token.tokenId));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível remover o retrato.');
    }
  }

  // ---------- duplicar cena e sessões ----------

  async duplicarCena(cena: Cena): Promise<void> {
    try {
      const copia = await this.cenaService.duplicar(this.campanhaId(), cena.cenaId);
      await this.recarregarCenas();
      this.toast.ok('“' + copia.nome + '” criada. Ponha em jogo quando quiser mostrá-la.');
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível duplicar a cena.');
    }
  }

  private async carregarSessoes(): Promise<void> {
    try {
      const todas = await firstValueFrom(this.sessaoService.getAll());
      this.sessoes.set(todas.filter(s => s.campanhaId == this.campanhaId()));
    } catch { /* sem a lista, só não dá para ligar o mapa a uma sessão */ }
  }

  /** Duplo clique no vazio: um "olhem aqui" (o equivalente ao toque longo do celular). */
  aoDuploClique(evento: MouseEvent): void {
    if (this.ferramenta() !== 'mover' || (evento.target as HTMLElement).closest('.token')) return;
    const caixa = this.palco()!.nativeElement.getBoundingClientRect();
    this.fazerPing(evento.clientX - caixa.left, evento.clientY - caixa.top);
  }

  private fazerPing(telaX: number, telaY: number): void {
    const cena = this.cena();
    if (!cena) return;
    const m = telaParaMundo(this.vista(), telaX, telaY);
    this.cenaService.ping(cena.cenaId, m.x, m.y).catch(() => undefined);
  }

  private mostrarPing(ping: PingDoMapa): void {
    if (ping.cenaId !== this.cenaId()) return;
    const chave = this.proximoPing++;
    this.pings.update(l => [...l, { ...ping, chave }]);
    setTimeout(() => this.pings.update(l => l.filter(p => p.chave !== chave)), DURACAO_DO_PING_MS);
  }

  private cancelarToqueLongo(): void {
    clearTimeout(this.toqueLongo);
    this.toqueLongo = undefined;
  }

  // ---------- névoa de guerra ----------

  private lerNeblina(n: { ativa: boolean; colunas: number; linhas: number; revelado: string }): Neblina {
    return { ativa: n.ativa, colunas: n.colunas, linhas: n.linhas, bits: decodificar(n.revelado) };
  }

  private async recarregarNeblina(): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      this.neblina.set(this.lerNeblina(await this.cenaService.neblina(this.campanhaId(), cena.cenaId)));
      this.cenas.update(l => l.map(c => (c.cenaId === cena.cenaId ? { ...c, neblinaAtiva: !!this.neblina()?.ativa } : c)));
      if (!this.neblina()?.ativa && (this.ferramenta() === 'revelar' || this.ferramenta() === 'cobrir')) this.ferramenta.set('mover');
    } catch { /* a névoa segue como estava */ }
  }

  async alternarNeblina(): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    const ligar = !this.neblinaAtiva();
    try {
      this.neblina.set(this.lerNeblina(await this.cenaService.ajustarNeblina(this.campanhaId(), cena.cenaId, { ativa: ligar })));
      if (ligar) {
        this.ferramenta.set('revelar');
        this.toast.info('Névoa ligada: tudo coberto. Arraste sobre o mapa para revelar áreas.');
      } else if (this.ferramenta() === 'revelar' || this.ferramenta() === 'cobrir') {
        this.ferramenta.set('mover');
      }
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível mudar a névoa.');
    }
  }

  async neblinaTudo(tudo: 'revelar' | 'cobrir'): Promise<void> {
    const cena = this.cena();
    if (!cena) return;
    try {
      this.neblina.set(this.lerNeblina(await this.cenaService.ajustarNeblina(this.campanhaId(), cena.cenaId, { ativa: true, tudo })));
    } catch (erro) {
      this.avisarErro(erro, 'Não foi possível mudar a névoa.');
    }
  }

  private async aplicarNeblina(r: { coluna: number; linha: number; largura: number; altura: number }, revelar: boolean): Promise<void> {
    const cena = this.cena();
    if (!cena || !this.neblina()) return;
    this.neblina.update(n => n && aplicarRetangulo(n, r, revelar)); // resposta imediata; o servidor confirma para todos
    try {
      await this.cenaService.alterarNeblina(cena.cenaId, r.coluna, r.linha, r.largura, r.altura, revelar);
    } catch (erro) {
      this.toast.erro(this.mensagemDoHub(erro) ?? 'Não foi possível mudar a névoa.');
      void this.recarregarNeblina();
    }
  }

  private desenharNeblina(): void {
    this.versaoNeblina.update(v => v + 1);
    const canvas = this.canvasNeblina()?.nativeElement;
    const n = this.neblina();
    const cena = this.cena();
    const fontes = this.fontesDeVisao();
    if (!canvas || !n?.ativa || !cena) return;

    // a névoa tem resolução própria (no máximo 2048 px), para os círculos de visão saírem suaves em mapas grandes
    const escala = Math.min(1, 2048 / Math.max(cena.largura, cena.altura));
    canvas.width = Math.ceil(cena.largura * escala);
    canvas.height = Math.ceil(cena.altura * escala);
    const contexto = canvas.getContext('2d');
    if (!contexto) return;

    contexto.fillStyle = 'rgb(14, 11, 10)';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.globalCompositeOperation = 'destination-out'; // daqui em diante, desenhar apaga a névoa

    // quadrados revelados à mão (em trechos contínuos por linha)
    const lado = cena.tamanhoCelula * escala;
    for (let l = 0; l < n.linhas; l++) {
      let inicio = -1;
      for (let c = 0; c <= n.colunas; c++) {
        const aberto = c < n.colunas && estaRevelado(n, c, l);
        if (aberto && inicio < 0) inicio = c;
        if (!aberto && inicio >= 0) {
          contexto.fillRect(Math.floor(inicio * lado), Math.floor(l * lado), Math.ceil((c - inicio) * lado) + 1, Math.ceil(lado) + 1);
          inicio = -1;
        }
      }
    }

    // visão dos tokens: a região que se enxerga (parada pelas paredes), com a borda esmaecida
    const segmentos = this.segmentosDeVisao();
    for (const f of fontes) {
      const cx = f.cx * escala, cy = f.cy * escala, r = f.r * escala;
      const gradiente = contexto.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
      gradiente.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradiente.addColorStop(1, 'rgba(0, 0, 0, 0)');
      contexto.fillStyle = gradiente;
      contexto.beginPath();
      poligonoDeVisao(f.cx, f.cy, f.r, segmentos).forEach((p, i) =>
        i === 0 ? contexto.moveTo(p.x * escala, p.y * escala) : contexto.lineTo(p.x * escala, p.y * escala));
      contexto.closePath();
      contexto.fill();
    }
  }

  // funções estáveis para o 3D (um bind() novo a cada ciclo faria o componente refazer tudo sem parar)
  readonly retratoDe3d = (t: TokenCena) => this.retratoDe(t);
  readonly info3d = (t: TokenCena) => this.info(t);
  readonly podeMover3d = (t: TokenCena) => this.podeMover(t);

  /** A régua (a minha e a dos outros) pronta para o 3D, em quadrados. */
  readonly reguas3d = computed<Regua3d[]>(() => {
    const minha = this.regua();
    const medidaMinha = this.medida();
    const lista: Regua3d[] = [];
    if (minha && medidaMinha && medidaMinha.quadrados > 0) {
      lista.push({
        chave: 'minha', ...minha, minha: true,
        texto: `${this.metros(medidaMinha.quadrados)} m · ${medidaMinha.quadrados} ${medidaMinha.quadrados === 1 ? 'quadrado' : 'quadrados'}`,
      });
    }
    for (const o of this.reguasDosOutros()) {
      if (o.quadrados > 0) lista.push({ chave: 'u' + o.usuarioId, c1: o.c1, l1: o.l1, c2: o.c2, l2: o.l2, minha: false, texto: `${this.metros(o.quadrados)} m · ${o.nome}` });
    }
    return lista;
  });

  /** O custo do arrasto como texto, no centro do quadrado onde o token cairia (em quadrados da grade). */
  readonly custo3d = computed(() => {
    const k = this.custoDoArrasto();
    const cena = this.cena();
    if (!k || !cena) return null;
    const texto = k.custo !== null
      ? `${k.custo} ${k.custo === 1 ? 'quadrado' : 'quadrados'} · ${this.metros(k.custo)} m`
      : k.ok ? 'livre' : 'fora do alcance';
    return { x: k.x / cena.tamanhoCelula, z: k.y / cena.tamanhoCelula, texto, ok: k.ok };
  });

  /** Sob névoa, quem não é o Mestre fica no escuro e só a luz dos tokens ilumina. */
  readonly escuro3d = computed(() => this.neblinaAtiva() && !this.ehMestre());

  reguaDe3d(p: PontoDeRegua3d): void {
    if (p.fase === 'inicio') {
      this.regua.set({ c1: p.coluna, l1: p.linha, c2: p.coluna, l2: p.linha });
      this.compartilharAMinhaRegua(true);
    } else {
      this.regua.update(r => (r ? { ...r, c2: p.coluna, l2: p.linha } : r));
      this.compartilharAMinhaRegua();
    }
  }

  /** O arrasto no 3D alimenta o mesmo estado do 2D: daí saem o alcance azul, o custo e o círculo de visão em movimento. */
  arrastando3d(a: ArrastoDe3d | null): void {
    const cena = this.cena();
    if (!a || !cena) { this.arrasto.set(null); return; }
    this.arrasto.set({ tokenId: a.tokenId, x: a.coluna * cena.tamanhoCelula, y: a.linha * cena.tamanhoCelula });
  }

  alternar3d(): void {
    this.modo3d.update(v => !v);
    if (this.modo3d()) this.ferramenta.set('mover');
  }

  /** O 3D não conseguiu iniciar (sem WebGL, por exemplo): volta para o 2D. */
  falhou3d(): void {
    this.modo3d.set(false);
    this.toast.erro('Este navegador não conseguiu abrir o mapa em 3D.');
  }

  mover3d(m: MovimentoDe3d): void {
    void this.moverToken(m.token, m.coluna, m.linha);
  }

  /** O retângulo que o Mestre está arrastando, em pixels do mundo, para desenhar o contorno. */
  contornoNeblina(cena: Cena): { x: number; y: number; w: number; h: number } | null {
    const r = this.retanguloNeblina();
    if (!r) return null;
    const q = retanguloEntre(r.c1, r.l1, r.c2, r.l2);
    return { x: q.coluna * cena.tamanhoCelula, y: q.linha * cena.tamanhoCelula, w: q.largura * cena.tamanhoCelula, h: q.altura * cena.tamanhoCelula };
  }

  private async carregarMembros(): Promise<void> {
    try {
      this.membros.set(await firstValueFrom(this.campanhas.getMembros(this.campanhaId())));
    } catch { /* sem a lista, só não dá para atribuir o token a um jogador */ }
  }

  // ---------- apoio ----------

  corDe = (cor: string) => `cor-${cor}`;

  private liberarImagem(): void {
    const url = this.imagemUrl();
    if (url) URL.revokeObjectURL(url);
    this.imagemUrl.set(null);
    this.versaoDaImagem = '';
  }

  private liberarPrevia(): void {
    const p = this.previa();
    if (p) URL.revokeObjectURL(p.url);
    this.previa.set(null);
  }

  private async carregarCombate(): Promise<void> {
    try {
      const combate = await firstValueFrom(this.combateService.getActiveCombatBySessao(this.sessaoId()));
      this.combate.set(combate ?? null);
      const recarregar = () => void this.carregarCombate();
      if (combate && this.combateConectadoId !== combate.combateId) {
        this.combateConectadoId = combate.combateId;
        await this.combateService.startConnection(combate.combateId, recarregar);
      } else if (!combate) {
        this.combateConectadoId = null;
        await this.combateService.startSessaoConnection(this.sessaoId(), recarregar);
      }
    } catch { /* sem combate, o mapa funciona do mesmo jeito */ }
  }

  private mensagemDoHub(erro: unknown): string | null {
    // o SignalR devolve "An unexpected error occurred invoking 'X' on the server. HubException: <mensagem>"
    const texto = erro instanceof Error ? erro.message : '';
    const m = texto.match(/HubException:\s*(.+)$/);
    return m ? m[1] : texto || null;
  }

  private avisarErro(erro: unknown, padrao: string): void {
    if (erro instanceof HttpErrorResponse) {
      const corpo = erro.error;
      const detalhe = typeof corpo === 'string' ? corpo : corpo?.message ?? corpo?.detail;
      this.toast.erro(detalhe || padrao);
    } else {
      this.toast.erro(padrao);
    }
  }
}
