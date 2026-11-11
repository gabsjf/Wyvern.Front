import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import type {
  AmbientLight, BufferGeometry, CanvasTexture, DirectionalLight, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PointLight, Raycaster, Scene, Sprite, SpriteMaterial, WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cena, CorToken, Parede, TokenCena } from '../../../models/cena';
import { iniciais } from '../../../utils/mapa-geometria';
import { algumLadoRevelado, amostrasDosLados, dividirEmTrechos } from '../../../utils/paredes-3d';

type Three = typeof import('three');

/** O que o 3D precisa saber do combate sobre um token (vem do mesmo cálculo do mapa 2D). */
export interface InfoToken3d {
  turno: boolean;
  abatido: boolean;
  vida: { pct: number } | null;
}

/** Uma régua a desenhar (a minha ou a de outra pessoa da mesa), em quadrados da grade. */
export interface Regua3d {
  chave: string;
  c1: number; l1: number; c2: number; l2: number;
  texto: string;
  minha: boolean;
}

/** O custo do arrasto em andamento, já como texto, no centro do quadrado onde o token cairia. */
export interface CustoDoArrasto3d {
  x: number;
  z: number;
  texto: string;
  ok: boolean;
}

export interface ArrastoDe3d {
  tokenId: number;
  coluna: number;
  linha: number;
}

/**
 * Um gesto no chão com uma ferramenta que não é "mover" (régua, área, desenho, borracha, paredes, névoa).
 * O ponto vem em quadrados, com fração, dentro do mapa; quem decide o que fazer é o mapa 2D.
 */
export interface GestoDe3d {
  fase: 'inicio' | 'mover' | 'fim';
  x: number;
  z: number;
}

/** Um ponto do chão, em quadrados (com fração). */
export interface PontoDe3d {
  x: number;
  z: number;
}

/** Um traço do desenho livre, com os pontos em pixels do mapa (como no 2D). */
export interface Traco3d {
  cor: CorToken;
  espessura: number;
  pontos: [number, number][];
}

/** O modelo de área de magia, em quadrados: círculo (esfera) ou polígono (cone e linha). */
export type Area3d =
  | { tipo: 'circulo'; cx: number; cz: number; r: number; texto: string; rx: number; rz: number }
  | { tipo: 'poligono'; pontos: [number, number][]; texto: string; rx: number; rz: number };

/** Um "olhem aqui" de alguém da mesa, em quadrados. */
export interface Ping3d {
  chave: number;
  x: number;
  z: number;
  nome: string;
}

/** A parede, porta ou janela que o Mestre está puxando, de um canto da grade a outro. */
export interface RascunhoDeParede3d {
  tipo: 'parede' | 'porta' | 'janela';
  x1: number; y1: number; x2: number; y2: number;
}

/** O retângulo de névoa que o Mestre está arrastando, em quadrados. */
export interface RetanguloDeNevoa3d {
  coluna: number; linha: number; largura: number; altura: number;
  cobrindo: boolean;
}

export interface MovimentoDe3d {
  token: TokenCena;
  coluna: number;
  linha: number;
}

/** Cada cor de token vira uma cor do tema (ou um tom fixo, como no mapa 2D). */
const COR_DO_TOKEN: Record<CorToken, string> = {
  ouro: 'var(--hi)',
  carmim: 'var(--accent)',
  verde: 'var(--ok)',
  azul: 'hsl(207 58% 50%)',
  violeta: 'hsl(275 42% 56%)',
  laranja: 'hsl(24 82% 52%)',
  cinza: 'hsl(30 6% 50%)',
  branco: 'hsl(40 22% 92%)',
};

const ALTURA_PAREDE = 1.05; // baixa o bastante para enxergar o interior das salas de uma câmera inclinada
const ALTURA_PORTA = 0.95;
const INCLINACAO = 0.92; // ângulo polar da vista inclinada (rad, ~53°)
const SOMBRAS_MAX = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 2 : 4; // sombras de luz pontual custam caro
const LIMITE_ARRASTO = 0.15; // quadrados que o ponteiro precisa andar para contar como arrasto
const LIMITE_TOQUE_PX = 6; // na tela: mais que isso já é arrastar a câmera, não um clique
const TOQUE_LONGO_MS = 550; // segurar parado vira um ping, como no 2D
const CICLO_DO_PING_MS = 1400;
const LADO_MAXIMO_DOS_TRACOS = 2048; // a textura dos desenhos não passa disso, qualquer que seja o mapa

interface VistaDoToken {
  grupo: Group;
  cartao: Mesh;
  base: Mesh;
  selecao: Mesh;
  turno: Mesh;
  vidaFundo: Mesh;
  vidaBarra: Mesh;
  luz: PointLight | null;
  chave: string;
  tamanho: number;
  textura: CanvasTexture | null;
}

interface ToqueNoChao {
  ponteiro: number;
  /** onde o ponteiro desceu, na tela */
  x: number;
  y: number;
  moveu: boolean;
  pingou: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

interface VistaDaParede {
  grupo: Group;
  /** pontos (em quadrados) dos dois lados da peça: para os jogadores, ela só aparece se algum estiver revelado */
  amostras: [number, number][];
  escondivel: boolean;
}

/**
 * O mapa tático em 3D. Só desenha: a posição de tudo continua em quadrados da grade e quem decide o que pode
 * se mover (e fala com o servidor) é o mapa 2D, que recebe o evento `mover`. O Three.js só é baixado quando
 * alguém liga o 3D.
 */
@Component({
  selector: 'app-mapa-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #area class="area" role="img" [attr.aria-label]="'Mapa em 3D: ' + cena().nome"></div>
    <div class="comandos" role="group" aria-label="Câmera">
      <button type="button" class="cmd" (click)="enquadrar(visaoDeCima(), true)" title="Ver o mapa inteiro" aria-label="Ver o mapa inteiro">
        <i class="bi bi-fullscreen" aria-hidden="true"></i>
      </button>
      @if (ehMestre()) {
        <button type="button" class="cmd" [class.ativo]="escuroManual()" (click)="escuroManual.set(!escuroManual())" [attr.aria-pressed]="escuroManual()"
                title="Ver no escuro, como os jogadores: só a luz dos tokens ilumina" aria-label="Ver no escuro">
          <i class="bi bi-lightbulb" aria-hidden="true"></i>
        </button>
      }
      <button type="button" class="cmd" [class.ativo]="visaoDeCima()" (click)="alternarVisao()" [attr.aria-pressed]="visaoDeCima()"
              title="Alternar entre vista de cima e inclinada" aria-label="Vista de cima">
        <i class="bi bi-grid-3x3" aria-hidden="true"></i>
      </button>
    </div>
    <p class="dica">
      @if (ferramenta() === 'mover') { Arraste o fundo para andar · botão direito gira · roda aproxima · duplo clique chama a mesa }
      @else { Arraste no chão para usar a ferramenta · botão direito gira · roda aproxima }
    </p>
    @if (!pronto()) { <p class="carregando" role="status">Carregando o 3D…</p> }
  `,
  styleUrl: './mapa-3d.scss',
})
export class Mapa3d {
  readonly cena = input.required<Cena>();
  readonly imagemUrl = input<string | null>(null);
  readonly tokens = input<TokenCena[]>([]);
  readonly paredes = input<Parede[]>([]);
  readonly selecionadoId = input<number | null>(null);
  readonly ehMestre = input(false);
  readonly retratoDe = input<(t: TokenCena) => string | null>(() => null);
  readonly infoDe = input<(t: TokenCena) => InfoToken3d | null>(() => null);
  readonly podeMover = input<(t: TokenCena) => boolean>(() => false);
  /** A canvas da névoa que o mapa 2D já desenha (usada como textura sobre o chão). */
  readonly neblina = input<HTMLCanvasElement | null>(null);
  readonly versaoNeblina = input(0);
  /** A canvas do alcance azul que o mapa 2D desenha para o token selecionado. */
  readonly alcance = input<HTMLCanvasElement | null>(null);
  readonly versaoAlcance = input(0);
  /** A ferramenta do mapa. Com "mover", o chão leva a câmera e os tokens; com qualquer outra, o chão vira gesto. */
  readonly ferramenta = input<string>('mover');
  readonly reguas = input<Regua3d[]>([]);
  readonly custo = input<CustoDoArrasto3d | null>(null);
  /** Sob névoa, os jogadores ficam no escuro e só a luz dos tokens ilumina. */
  readonly escuro = input(false);
  readonly tracos = input<Traco3d[]>([]);
  readonly areaDeMagia = input<Area3d | null>(null);
  readonly pings = input<Ping3d[]>([]);
  readonly rascunhoDeParede = input<RascunhoDeParede3d | null>(null);
  readonly retanguloDeNevoa = input<RetanguloDeNevoa3d | null>(null);

  readonly selecionar = output<TokenCena>();
  readonly mover = output<MovimentoDe3d>();
  readonly falhou = output<void>();
  readonly arrastando = output<ArrastoDe3d | null>();
  readonly gesto = output<GestoDe3d>();
  /** Duplo clique (ou segurar parado) no chão: "olhem aqui". */
  readonly ping = output<PontoDe3d>();
  /** Clique rápido no chão vazio, com a ferramenta "mover" (abre portas, desmarca o token). */
  readonly toque = output<PontoDe3d>();

  protected readonly pronto = signal(false);
  protected readonly visaoDeCima = signal(false);
  protected readonly escuroManual = signal(false);

  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private T!: Three;
  private cenario!: Scene;
  private camera!: PerspectiveCamera;
  private renderizador!: WebGLRenderer;
  private controles!: OrbitControls;
  private observador?: ResizeObserver;
  private destruido = false;

  private chao: Mesh | null = null;
  private grade: Object3D | null = null;
  private paredesGrupo!: Group;
  private readonly camadas = new Map<string, { malha: Mesh; textura: CanvasTexture; tamanho: string }>();
  private reguasGrupo!: Group;
  private areaGrupo!: Group;
  private rascunhoGrupo!: Group;
  private readonly pingsVistos = new Map<number, { grupo: Group; aneis: Mesh[]; inicio: number }>();
  private telaDosTracos: HTMLCanvasElement | null = null;
  private rotuloDoCusto: Sprite | null = null;
  private ambiente!: AmbientLight;
  private gestoAtivo = false;
  /** Um clique no chão vazio que ainda pode virar toque, ping (segurando) ou arrasto da câmera. */
  private toqueEmCurso: ToqueNoChao | null = null;
  private arrastoAvisado = false;
  private readonly paredesVistas: VistaDaParede[] = [];
  private readonly vistas = new Map<number, VistaDoToken>();
  private readonly texturas = new Map<string, CanvasTexture>();
  private readonly retratosCarregados = new Map<string, HTMLImageElement>();
  private cenaDesenhada: number | null = null;
  private versaoDaImagem: string | null = null;

  private arrasto: {
    token: TokenCena; vista: VistaDoToken; moveu: boolean; coluna: number; linha: number;
    inicioX: number; inicioZ: number; desvioX: number; desvioZ: number;
  } | null = null;
  private pulso = 0;
  private sol!: DirectionalLight;

  constructor() {
    afterNextRender(() => void this.iniciar());
    inject(DestroyRef).onDestroy(() => this.destruir());

    effect(() => {
      if (!this.pronto()) return;
      const cena = this.cena();
      const url = this.imagemUrl();
      untracked(() => this.montarChao(cena, url));
    });
    effect(() => {
      if (!this.pronto()) return;
      const paredes = this.paredes();
      this.ehMestre();
      const cena = this.cena();
      untracked(() => this.montarParedes(paredes, cena));
    });
    effect(() => {
      if (!this.pronto()) return;
      const tokens = this.tokens();
      const selecionado = this.selecionadoId();
      // ler retratos e informações de combate aqui faz o efeito acompanhar o que carrega, vida, turno e abatidos
      const retratos = new Map(tokens.map(t => [t.tokenId, this.retratoDe()(t)]));
      const infos = new Map(tokens.map(t => [t.tokenId, this.infoDe()(t)]));
      untracked(() => this.sincronizarTokens(tokens, selecionado, infos, retratos));
    });
    effect(() => {
      if (!this.pronto()) return;
      const canvas = this.neblina();
      this.versaoNeblina();
      const mestre = this.ehMestre();
      untracked(() => this.atualizarNevoa(canvas, mestre));
    });
    effect(() => {
      if (!this.pronto()) return;
      const canvas = this.alcance();
      this.versaoAlcance();
      untracked(() => this.atualizarCamada('alcance', canvas, 0.02, 4, 1));
    });
    effect(() => {
      if (!this.pronto()) return;
      const reguas = this.reguas();
      untracked(() => this.montarReguas(reguas));
    });
    effect(() => {
      if (!this.pronto()) return;
      const custo = this.custo();
      untracked(() => this.montarRotuloDoCusto(custo));
    });
    effect(() => {
      if (!this.pronto()) return;
      const escuro = this.escuro() || this.escuroManual();
      untracked(() => this.aplicarAmbiente(escuro));
    });
    effect(() => {
      if (!this.pronto()) return;
      const tracos = this.tracos();
      const cena = this.cena();
      untracked(() => this.desenharTracos(tracos, cena));
    });
    effect(() => {
      if (!this.pronto()) return;
      const area = this.areaDeMagia();
      untracked(() => this.montarArea(area));
    });
    effect(() => {
      if (!this.pronto()) return;
      const pings = this.pings();
      untracked(() => this.sincronizarPings(pings));
    });
    effect(() => {
      if (!this.pronto()) return;
      const parede = this.rascunhoDeParede();
      const nevoa = this.retanguloDeNevoa();
      untracked(() => this.montarRascunho(parede, nevoa));
    });
  }

  // ---------- ciclo de vida ----------

  private async iniciar(): Promise<void> {
    try {
      const [T, { OrbitControls }] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
      if (this.destruido) return;
      this.T = T;

      const el = this.area().nativeElement;
      const renderizador = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderizador.shadowMap.enabled = true;
      renderizador.shadowMap.type = T.PCFSoftShadowMap;
      renderizador.outputColorSpace = T.SRGBColorSpace;
      el.appendChild(renderizador.domElement);
      this.renderizador = renderizador;

      this.cenario = new T.Scene();
      this.cenario.background = new T.Color(this.corDoTema('var(--bg)'));
      this.camera = new T.PerspectiveCamera(38, 1, 0.1, 500);
      this.paredesGrupo = new T.Group();
      this.cenario.add(this.paredesGrupo);

      this.ambiente = new T.AmbientLight(0xffffff, 0.75);
      this.cenario.add(this.ambiente);
      this.reguasGrupo = new T.Group();
      this.areaGrupo = new T.Group();
      this.rascunhoGrupo = new T.Group();
      this.cenario.add(this.reguasGrupo, this.areaGrupo, this.rascunhoGrupo);
      const sol = new T.DirectionalLight(0xfff1dc, 1.6);
      sol.castShadow = true;
      sol.shadow.mapSize.set(2048, 2048);
      sol.shadow.bias = -0.0004;
      this.cenario.add(sol, sol.target);
      this.sol = sol;

      this.controles = new OrbitControls(this.camera, renderizador.domElement);
      const c = this.controles;
      c.enableDamping = true;
      c.dampingFactor = 0.1;
      c.screenSpacePanning = false;
      c.maxPolarAngle = Math.PI * 0.47;
      c.mouseButtons = { LEFT: T.MOUSE.PAN, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE };
      c.touches = { ONE: T.TOUCH.PAN, TWO: T.TOUCH.DOLLY_ROTATE };
      c.addEventListener('change', () => this.limitarAlvo());

      const dom = renderizador.domElement;
      dom.style.touchAction = 'none';
      dom.addEventListener('contextmenu', e => e.preventDefault());
      dom.addEventListener('pointerdown', e => this.aoApertar(e));
      dom.addEventListener('pointermove', e => this.aoMover(e));
      dom.addEventListener('pointerup', e => this.aoSoltar(e));
      dom.addEventListener('pointercancel', e => this.aoSoltar(e, true));
      dom.addEventListener('dblclick', e => this.aoDuploClique(e));

      this.observador = new ResizeObserver(() => this.redimensionar());
      this.observador.observe(el);
      this.redimensionar();

      renderizador.setAnimationLoop(() => this.quadro());
      this.pronto.set(true);
    } catch (erro) {
      console.error('Não foi possível iniciar o 3D', erro);
      this.falhou.emit();
    }
  }

  private destruir(): void {
    this.destruido = true;
    clearTimeout(this.toqueEmCurso?.timer);
    this.observador?.disconnect();
    if (!this.renderizador) return;
    this.renderizador.setAnimationLoop(null);
    this.controles?.dispose();
    this.cenario?.traverse(o => this.liberar(o));
    this.texturas.forEach(t => t.dispose());
    this.texturas.clear();
    this.camadas.forEach(c => c.textura.dispose());
    this.camadas.clear();
    this.renderizador.dispose();
    this.renderizador.forceContextLoss();
    this.renderizador.domElement.remove();
  }

  private liberar(o: Object3D): void {
    const m = o as Mesh;
    m.geometry?.dispose();
    const material = m.material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach(x => x.dispose());
    else material?.dispose();
  }

  private redimensionar(): void {
    const el = this.area().nativeElement;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderizador.setSize(w, h, false);
    this.renderizador.domElement.style.width = '100%';
    this.renderizador.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private quadro(): void {
    this.controles.update();
    this.pulso += 0.04;
    const alvo = this.camera.position;
    for (const v of this.vistas.values()) {
      // o cartão em pé encara a câmera (só gira no eixo vertical); o abatido fica deitado
      if (v.cartao.userData['deitado']) continue;
      v.cartao.rotation.y = Math.atan2(alvo.x - v.grupo.position.x, alvo.z - v.grupo.position.z);
      v.vidaFundo.rotation.y = v.vidaBarra.rotation.y = v.cartao.rotation.y;
      if (v.turno.visible) v.turno.scale.setScalar(1 + Math.sin(this.pulso) * 0.06);
    }
    // o ping: dois anéis que crescem e somem, um atrás do outro, como no 2D
    const agora = performance.now();
    for (const p of this.pingsVistos.values()) {
      p.aneis.forEach((anel, i) => {
        const t = (((agora - p.inicio) / CICLO_DO_PING_MS) + i * 0.32) % 1;
        anel.scale.setScalar(0.25 + t * 1.75);
        (anel.material as MeshBasicMaterial).opacity = 1 - t;
      });
    }
    this.renderizador.render(this.cenario, this.camera);
  }

  // ---------- câmera ----------

  private largura(cena = this.cena()): number { return cena.largura / cena.tamanhoCelula; }
  private altura(cena = this.cena()): number { return cena.altura / cena.tamanhoCelula; }

  /** Enquadra a câmera: por padrão, em torno dos tokens da cena (onde a ação está); `inteiro` mostra o mapa todo. */
  enquadrar(deCima: boolean, inteiro = false): void {
    if (!this.pronto()) return;
    const T = this.T;
    const w = this.largura(), h = this.altura();
    let area = { x0: 0, z0: 0, x1: w, z1: h };
    const daCena = this.tokens().filter(t => t.cenaId === this.cena().cenaId);
    if (!inteiro && daCena.length > 0) {
      const margem = 5, minimo = { w: 16, h: 11 };
      let x0 = Math.min(...daCena.map(t => t.coluna)) - margem, x1 = Math.max(...daCena.map(t => t.coluna + t.tamanho)) + margem;
      let z0 = Math.min(...daCena.map(t => t.linha)) - margem, z1 = Math.max(...daCena.map(t => t.linha + t.tamanho)) + margem;
      if (x1 - x0 < minimo.w) { const c = (x0 + x1) / 2; x0 = c - minimo.w / 2; x1 = c + minimo.w / 2; }
      if (z1 - z0 < minimo.h) { const c = (z0 + z1) / 2; z0 = c - minimo.h / 2; z1 = c + minimo.h / 2; }
      area = { x0: Math.max(0, x0), z0: Math.max(0, z0), x1: Math.min(w, x1), z1: Math.min(h, z1) };
    }
    const aw = area.x1 - area.x0, ah = area.z1 - area.z0;
    const alvo = new T.Vector3((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2);
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspecto = this.camera.aspect || 1;
    const distancia = Math.max(ah / 2 / Math.tan(fov / 2), aw / 2 / (Math.tan(fov / 2) * aspecto)) * 1.08;
    const polar = deCima ? 0.0001 : INCLINACAO;
    this.controles.target.copy(alvo);
    this.camera.position.set(alvo.x, Math.cos(polar) * distancia, alvo.z + Math.sin(polar) * distancia);
    this.controles.minDistance = 2.5;
    this.controles.maxDistance = Math.max(w, h) * 2;
    this.camera.near = 0.1;
    this.camera.far = Math.max(w, h) * 6;
    this.camera.updateProjectionMatrix();
    this.controles.update();
  }

  protected alternarVisao(): void {
    const deCima = !this.visaoDeCima();
    this.visaoDeCima.set(deCima);
    this.enquadrar(deCima);
  }

  /** A câmera não anda para fora do mapa. */
  private limitarAlvo(): void {
    const a = this.controles.target;
    const x = Math.min(Math.max(a.x, 0), this.largura());
    const z = Math.min(Math.max(a.z, 0), this.altura());
    if (x !== a.x || z !== a.z) {
      this.camera.position.x += x - a.x;
      this.camera.position.z += z - a.z;
      a.x = x;
      a.z = z;
    }
  }

  // ---------- chão e grade ----------

  private montarChao(cena: Cena, url: string | null): void {
    const T = this.T;
    const w = this.largura(cena), h = this.altura(cena);
    const trocouDeCena = this.cenaDesenhada !== cena.cenaId;
    const chave = `${cena.cenaId}|${cena.imagemVersao}|${url ?? ''}|${w}x${h}`;

    if (this.versaoDaImagem !== chave) {
      this.versaoDaImagem = chave;
      this.removerObjeto(this.chao);
      this.removerObjeto(this.grade);

      const material = new T.MeshStandardMaterial({ color: 0x2a2624, roughness: 1, metalness: 0 });
      const geometria = new T.PlaneGeometry(w, h);
      geometria.rotateX(-Math.PI / 2);
      const chao = new T.Mesh(geometria, material);
      chao.position.set(w / 2, 0, h / 2);
      chao.receiveShadow = true;
      this.cenario.add(chao);
      this.chao = chao;

      if (url) {
        new T.TextureLoader().load(url, textura => {
          if (this.destruido || this.chao !== chao) { textura.dispose(); return; }
          textura.colorSpace = T.SRGBColorSpace;
          textura.anisotropy = this.renderizador.capabilities.getMaxAnisotropy();
          material.map = textura;
          material.color.set(0xffffff);
          material.needsUpdate = true;
        });
      }

      // a grade: uma linha fina por quadrado, só para dar escala
      const pontos: number[] = [];
      for (let x = 0; x <= Math.floor(w); x++) pontos.push(x, 0.01, 0, x, 0.01, h);
      for (let z = 0; z <= Math.floor(h); z++) pontos.push(0, 0.01, z, w, 0.01, z);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pontos, 3));
      const linhas = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
      this.cenario.add(linhas);
      this.grade = linhas;

      const alcance = Math.max(w, h);
      this.sol.position.set(w * 0.35, alcance * 0.9, h * 1.1);
      this.sol.target.position.set(w / 2, 0, h / 2);
      const s = this.sol.shadow.camera;
      s.left = -alcance; s.right = alcance; s.top = alcance; s.bottom = -alcance; s.near = 0.5; s.far = alcance * 4;
      s.updateProjectionMatrix();
    }

    if (trocouDeCena) {
      this.cenaDesenhada = cena.cenaId;
      this.enquadrar(this.visaoDeCima());
    }
  }

  private removerObjeto(o: Object3D | null): void {
    if (!o) return;
    this.cenario.remove(o);
    this.liberar(o);
  }

  // ---------- paredes, portas e janelas ----------

  private montarParedes(paredes: Parede[], cena: Cena): void {
    const T = this.T;
    for (const v of this.paredesVistas) this.paredesGrupo.remove(v.grupo);
    this.paredesGrupo.traverse(o => this.liberar(o));
    this.paredesGrupo.clear();
    this.paredesVistas.length = 0;

    const mestre = this.ehMestre();
    const pedra = new T.MeshStandardMaterial({ color: this.corDoTema('color-mix(in srgb, var(--accent) 38%, #6b625a)'), roughness: 0.9 });
    const madeira = new T.MeshStandardMaterial({ color: this.corDoTema('color-mix(in srgb, var(--hi) 55%, #3a2412)'), roughness: 0.7 });
    const vidro = new T.MeshStandardMaterial({ color: this.corDoTema('var(--muted)'), roughness: 0.2, transparent: true, opacity: 0.28 });

    // No 3D a parede é sólida para todos (no 2D dos jogadores ela já vem pintada na imagem do mapa): sem ela, a luz das
    // tochas e da visão atravessava os cômodos. Para os jogadores, a parede é quebrada em trechos de um quadrado e cada
    // trecho segue a névoa dos dois lados, para não entregar a planta do que ainda está escondido.
    const pecas = paredes.flatMap(p => (!mestre && !p.porta && !p.janela ? dividirEmTrechos(p).map(t => ({ ...p, ...t })) : [p]));

    for (const p of pecas) {
      const dx = p.x2 - p.x1, dz = p.y2 - p.y1;
      const comprimento = Math.hypot(dx, dz);
      if (comprimento === 0) continue;
      const angulo = Math.atan2(dz, dx);
      const g = new T.Group();
      g.position.set((p.x1 + p.x2) / 2, 0, (p.y1 + p.y2) / 2);
      g.rotation.y = -angulo;

      const caixa = (l: number, a: number, e: number, material: Material, x = 0, y = 0, z = 0): Mesh => {
        const m = new T.Mesh(new T.BoxGeometry(l, a, e), material);
        m.position.set(x, y + a / 2, z);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        return m;
      };

      if (p.porta) {
        if (p.aberta) {
          // batentes e a folha aberta, presa na extremidade inicial
          caixa(0.14, ALTURA_PORTA, 0.16, madeira, -comprimento / 2);
          caixa(0.14, ALTURA_PORTA, 0.16, madeira, comprimento / 2);
          const folha = caixa(comprimento * 0.92, ALTURA_PORTA * 0.95, 0.08, madeira);
          folha.position.set(-comprimento / 2, ALTURA_PORTA * 0.475, comprimento * 0.46);
          folha.rotation.y = Math.PI / 2;
        } else {
          caixa(comprimento, ALTURA_PORTA, 0.1, madeira);
          caixa(comprimento + 0.1, 0.1, 0.16, madeira, 0, ALTURA_PORTA);
        }
      } else if (p.janela) {
        caixa(comprimento + 0.06, 0.4, 0.16, pedra);
        caixa(comprimento, 0.5, 0.03, vidro, 0, 0.4);
        caixa(comprimento + 0.06, 0.08, 0.16, pedra, 0, 0.9);
      } else {
        caixa(comprimento + 0.14, ALTURA_PAREDE, 0.14, pedra);
      }
      this.paredesGrupo.add(g);
      this.paredesVistas.push({ grupo: g, amostras: amostrasDosLados(p), escondivel: !mestre });
    }
    this.esconderSobNevoa(cena);
  }

  // ---------- névoa ----------

  private atualizarNevoa(canvas: HTMLCanvasElement | null, mestre: boolean): void {
    // o Mestre enxerga o mapa por baixo da névoa; os jogadores, não
    this.atualizarCamada('nevoa', canvas, 0.03, 5, mestre ? 0.6 : 1);
    this.esconderSobNevoa(this.cena());
  }

  /** Uma camada sobre o chão desenhada a partir de uma canvas do mapa 2D (névoa, alcance azul): textura refeita só quando o tamanho muda. */
  private atualizarCamada(nome: string, canvas: HTMLCanvasElement | null, y: number, ordem: number, opacidade: number): void {
    const T = this.T;
    const atual = this.camadas.get(nome);
    const remover = (c: { malha: Mesh; textura: CanvasTexture }): void => {
      this.cenario.remove(c.malha);
      this.liberar(c.malha);
      c.textura.dispose();
    };
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      if (atual) { remover(atual); this.camadas.delete(nome); }
      return;
    }
    const cena = this.cena();
    const tamanho = `${canvas.width}x${canvas.height}|${cena.cenaId}|${cena.largura}x${cena.altura}`;
    let camada = atual;
    if (!camada || camada.tamanho !== tamanho) {
      if (camada) remover(camada);
      const textura = new T.CanvasTexture(canvas);
      textura.colorSpace = T.SRGBColorSpace;
      const geometria = new T.PlaneGeometry(this.largura(cena), this.altura(cena));
      geometria.rotateX(-Math.PI / 2);
      const malha = new T.Mesh(geometria, new T.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false }));
      malha.position.set(this.largura(cena) / 2, y, this.altura(cena) / 2);
      malha.renderOrder = ordem;
      this.cenario.add(malha);
      camada = { malha, textura, tamanho };
      this.camadas.set(nome, camada);
    } else {
      camada.textura.needsUpdate = true;
    }
    (camada.malha.material as MeshBasicMaterial).opacity = opacidade;
  }

  /**
   * Para os jogadores, paredes, portas e janelas totalmente cobertas pela névoa não aparecem (senão entregariam o que ela
   * esconde). Cada peça fica na divisa entre quadrados, então confere os dois lados: basta um revelado.
   */
  private esconderSobNevoa(cena: Cena): void {
    const canvas = this.neblina();
    const contexto = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (!canvas || !contexto || canvas.width === 0 || canvas.height === 0) {
      for (const v of this.paredesVistas) v.grupo.visible = true;
      return;
    }
    // a canvas da névoa cobre o mapa inteiro: converte quadrados em pixels dela
    const escalaX = canvas.width / (cena.largura || canvas.width);
    const escalaY = canvas.height / (cena.altura || canvas.height);
    const dados = contexto.getImageData(0, 0, canvas.width, canvas.height).data;
    const revelado = (x: number, y: number): boolean => {
      const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(x * cena.tamanhoCelula * escalaX)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(y * cena.tamanhoCelula * escalaY)));
      return dados[(py * canvas.width + px) * 4 + 3] < 200;
    };
    for (const v of this.paredesVistas) v.grupo.visible = !v.escondivel || algumLadoRevelado(v.amostras, revelado);
  }

  // ---------- tokens ----------

  private sincronizarTokens(tokens: TokenCena[], selecionado: number | null, infos: Map<number, InfoToken3d | null>, retratos: Map<number, string | null>): void {
    const vivos = new Set(tokens.map(t => t.tokenId));
    for (const [id, v] of this.vistas) {
      if (vivos.has(id)) continue;
      this.cenario.remove(v.grupo);
      v.grupo.traverse(o => this.liberar(o));
      this.vistas.delete(id);
    }

    for (const t of tokens) {
      let v = this.vistas.get(t.tokenId);
      if (!v) { v = this.criarVista(t); this.vistas.set(t.tokenId, v); this.cenario.add(v.grupo); }
      const info = infos.get(t.tokenId) ?? null;
      const lado = t.tamanho;

      if (!(this.arrasto && this.arrasto.token.tokenId === t.tokenId && this.arrasto.moveu)) {
        v.grupo.position.set(t.coluna + lado / 2, 0, t.linha + lado / 2);
      }

      // o desenho do cartão só é refeito quando algo visível muda
      const retrato = retratos.get(t.tokenId) ?? null;
      const chave = `${t.nome}|${t.cor}|${t.inimigo}|${retrato ?? ''}|${t.imagemVersao}`;
      if (v.chave !== chave) {
        v.chave = chave;
        v.textura?.dispose();
        v.textura = this.desenharCartao(t, retrato, v);
        ((v.cartao.material) as MeshBasicMaterial).map = v.textura;
        (v.cartao.material as MeshBasicMaterial).needsUpdate = true;
      }

      const cor = this.corDoTema(COR_DO_TOKEN[t.cor] ?? COR_DO_TOKEN.ouro);
      (v.base.material as MeshStandardMaterial).color.set(cor);

      const abatido = !!info?.abatido;
      v.cartao.userData['deitado'] = abatido;
      if (abatido) {
        v.cartao.rotation.set(-Math.PI / 2, 0, 0);
        v.cartao.position.set(0, 0.13, 0);
      } else {
        v.cartao.rotation.x = 0;
        v.cartao.position.set(0, 0.1 + (lado * 1.1) / 2, 0);
      }
      const opaco = t.oculto ? 0.45 : abatido ? 0.6 : 1;
      (v.cartao.material as MeshBasicMaterial).opacity = opaco;
      (v.base.material as MeshStandardMaterial).opacity = opaco;
      (v.base.material as MeshStandardMaterial).transparent = opaco < 1;

      v.selecao.visible = selecionado === t.tokenId;
      v.turno.visible = !!info?.turno && !abatido;

      const comVida = !!info?.vida && !abatido;
      v.vidaFundo.visible = v.vidaBarra.visible = comVida;
      if (comVida && info?.vida) {
        const pct = Math.max(0.02, info.vida.pct / 100);
        const larguraBarra = lado * 0.8;
        v.vidaFundo.position.set(0, 0.1 + lado * 1.1 + 0.14, 0);
        v.vidaBarra.position.set(-(larguraBarra * (1 - pct)) / 2, 0.1 + lado * 1.1 + 0.14, 0.001);
        v.vidaBarra.scale.set(pct, 1, 1);
        (v.vidaBarra.material as MeshBasicMaterial).color.set(this.corDoTema(info.vida.pct <= 25 ? 'var(--danger)' : 'var(--ok)'));
      }

      this.atualizarLuz(v, t);
    }
  }

  private criarVista(t: TokenCena): VistaDoToken {
    const T = this.T;
    const lado = t.tamanho;
    const grupo = new T.Group();

    const base = new T.Mesh(new T.CylinderGeometry(0.44 * lado, 0.48 * lado, 0.1, 40), new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }));
    base.position.y = 0.05;
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData['tokenId'] = t.tokenId;
    grupo.add(base);

    const cartao = new T.Mesh(
      new T.PlaneGeometry(0.8 * lado, 1.1 * lado),
      new T.MeshBasicMaterial({ transparent: true, side: T.DoubleSide, alphaTest: 0.02 }),
    );
    cartao.userData['tokenId'] = t.tokenId;
    grupo.add(cartao);

    const anel = (interno: number, externo: number, cor: string, y: number): Mesh => {
      const g = new T.RingGeometry(interno * lado, externo * lado, 48);
      g.rotateX(-Math.PI / 2);
      const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: this.corDoTema(cor), transparent: true, opacity: 0.95, depthWrite: false }));
      m.position.y = y;
      m.visible = false;
      grupo.add(m);
      return m;
    };
    const selecao = anel(0.52, 0.6, 'var(--fg)', 0.115);
    const turno = anel(0.62, 0.7, 'var(--hi)', 0.12);

    const barra = (cor: string, z: number): Mesh => {
      const m = new T.Mesh(new T.PlaneGeometry(lado * 0.8, 0.09), new T.MeshBasicMaterial({ color: this.corDoTema(cor), side: T.DoubleSide, depthTest: false }));
      m.visible = false;
      m.renderOrder = 10 + z;
      grupo.add(m);
      return m;
    };
    const vidaFundo = barra('color-mix(in srgb, var(--bg) 85%, black)', 0);
    const vidaBarra = barra('var(--ok)', 1);

    return { grupo, cartao, base, selecao, turno, vidaFundo, vidaBarra, luz: null, chave: '', tamanho: lado, textura: null };
  }

  /** O cartão em pé: borda na cor do token, retrato (ou iniciais) e a marca de inimigo. */
  private desenharCartao(t: TokenCena, retrato: string | null, vista: VistaDoToken): CanvasTexture {
    const T = this.T;
    const larg = 256, alt = 356;
    const canvas = document.createElement('canvas');
    canvas.width = larg;
    canvas.height = alt;
    const c = canvas.getContext('2d')!;
    const cor = this.corDoTema(COR_DO_TOKEN[t.cor] ?? COR_DO_TOKEN.ouro);
    const css = '#' + cor.toString(16).padStart(6, '0');
    const fundo = '#' + this.corDoTema('var(--surface)').toString(16).padStart(6, '0');
    const texto = '#' + this.corDoTema('var(--fg)').toString(16).padStart(6, '0');

    const contorno = (): void => {
      c.beginPath();
      c.roundRect(10, 10, larg - 20, alt - 20, 40);
    };
    const pintar = (imagem: HTMLImageElement | null): void => {
      c.clearRect(0, 0, larg, alt);
      contorno();
      c.fillStyle = fundo;
      c.fill();
      c.lineWidth = 14;
      c.strokeStyle = css;
      c.stroke();
      if (t.inimigo) {
        c.fillStyle = css;
        c.fillRect(46, alt - 62, larg - 92, 8);
      }
      // medalhão central
      c.save();
      c.beginPath();
      c.arc(larg / 2, alt / 2 - 12, 92, 0, Math.PI * 2);
      c.clip();
      if (imagem) {
        const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight) || 1;
        c.drawImage(imagem, (imagem.naturalWidth - lado) / 2, (imagem.naturalHeight - lado) / 2, lado, lado, larg / 2 - 92, alt / 2 - 104, 184, 184);
      } else {
        c.fillStyle = css;
        c.globalAlpha = 0.28;
        c.fillRect(0, 0, larg, alt);
        c.globalAlpha = 1;
        c.fillStyle = texto;
        c.font = '700 84px "Barlow Condensed", "Arial Narrow", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(iniciais(t.nome), larg / 2, alt / 2 - 8);
      }
      c.restore();
      c.beginPath();
      c.arc(larg / 2, alt / 2 - 12, 92, 0, Math.PI * 2);
      c.lineWidth = 6;
      c.strokeStyle = css;
      c.stroke();
    };
    pintar(null);

    const textura = new T.CanvasTexture(canvas);
    textura.colorSpace = T.SRGBColorSpace;
    textura.anisotropy = 4;
    if (retrato) {
      const pronta = this.retratosCarregados.get(retrato);
      const aplicar = (img: HTMLImageElement): void => { pintar(img); textura.needsUpdate = true; };
      if (pronta) aplicar(pronta);
      else {
        const img = new Image();
        img.onload = () => { this.retratosCarregados.set(retrato, img); if (!this.destruido && vista.textura === textura) aplicar(img); };
        img.src = retrato;
      }
    }
    return textura;
  }

  // ---------- ponteiro: selecionar e arrastar tokens ----------

  private raio(evento: MouseEvent): Raycaster {
    const T = this.T;
    const r = this.renderizador.domElement.getBoundingClientRect();
    const ndc = new T.Vector2(((evento.clientX - r.left) / r.width) * 2 - 1, -(((evento.clientY - r.top) / r.height) * 2 - 1));
    const raio = new T.Raycaster();
    raio.setFromCamera(ndc, this.camera);
    return raio;
  }

  private tokenSob(evento: MouseEvent): { token: TokenCena; vista: VistaDoToken } | null {
    const alvos: Object3D[] = [];
    for (const v of this.vistas.values()) alvos.push(v.cartao, v.base);
    const acertos = this.raio(evento).intersectObjects(alvos, false);
    for (const a of acertos) {
      const id = a.object.userData['tokenId'] as number | undefined;
      const token = this.tokens().find(t => t.tokenId === id);
      const vista = id !== undefined ? this.vistas.get(id) : undefined;
      if (token && vista) return { token, vista };
    }
    return null;
  }

  private pontoNoChao(evento: MouseEvent): { x: number; z: number } | null {
    const T = this.T;
    const ponto = new T.Vector3();
    const plano = new T.Plane(new T.Vector3(0, 1, 0), 0);
    return this.raio(evento).ray.intersectPlane(plano, ponto) ? { x: ponto.x, z: ponto.z } : null;
  }

  /** O ponto do chão sob o ponteiro, em quadrados, sem sair do mapa (um pouco antes da borda, para cair num quadrado dele). */
  private pontoNoMapa(evento: MouseEvent): PontoDe3d | null {
    const ponto = this.pontoNoChao(evento);
    if (!ponto) return null;
    const borda = 0.001;
    return {
      x: Math.min(Math.max(ponto.x, 0), this.largura() - borda),
      z: Math.min(Math.max(ponto.z, 0), this.altura() - borda),
    };
  }

  private aoApertar(evento: PointerEvent): void {
    if (evento.button !== 0) return;
    if (this.ferramenta() !== 'mover') {
      // régua, área, desenho, paredes e névoa: o gesto é da ferramenta, não da câmera
      const p = this.pontoNoMapa(evento);
      if (!p) return;
      this.gestoAtivo = true;
      this.controles.enabled = false;
      this.renderizador.domElement.setPointerCapture(evento.pointerId);
      this.gesto.emit({ fase: 'inicio', ...p });
      return;
    }
    const sob = this.tokenSob(evento);
    if (!sob) { this.comecarToque(evento); return; }
    this.selecionar.emit(sob.token);
    if (!this.podeMover()(sob.token)) return;
    const ponto = this.pontoNoChao(evento);
    const lado = sob.token.tamanho;
    // o cartão está acima do chão: guarda a distância entre onde o ponteiro cai no chão e o centro do token,
    // para ele não "saltar" quando começa a ser arrastado
    this.arrasto = {
      token: sob.token, vista: sob.vista, moveu: false, coluna: sob.token.coluna, linha: sob.token.linha,
      inicioX: ponto?.x ?? 0, inicioZ: ponto?.z ?? 0,
      desvioX: ponto ? sob.token.coluna + lado / 2 - ponto.x : 0, desvioZ: ponto ? sob.token.linha + lado / 2 - ponto.z : 0,
    };
    this.controles.enabled = false; // o gesto é do token, não da câmera
    this.renderizador.domElement.setPointerCapture(evento.pointerId);
  }

  /** Clique no chão vazio: se o ponteiro ficar parado, segurar vira ping; soltar logo vira toque. A câmera segue livre. */
  private comecarToque(evento: PointerEvent): void {
    this.cancelarToque();
    const toque: ToqueNoChao = { ponteiro: evento.pointerId, x: evento.clientX, y: evento.clientY, moveu: false, pingou: false };
    toque.timer = setTimeout(() => {
      if (toque.moveu || this.toqueEmCurso !== toque) return;
      const p = this.pontoNoMapa(evento);
      if (!p) return;
      toque.pingou = true;
      this.ping.emit(p);
    }, TOQUE_LONGO_MS);
    this.toqueEmCurso = toque;
  }

  private cancelarToque(): void {
    clearTimeout(this.toqueEmCurso?.timer);
    this.toqueEmCurso = null;
  }

  private aoDuploClique(evento: MouseEvent): void {
    if (this.ferramenta() !== 'mover' || this.tokenSob(evento)) return;
    const p = this.pontoNoMapa(evento);
    if (p) this.ping.emit(p);
  }

  private aoMover(evento: PointerEvent): void {
    if (this.gestoAtivo) {
      const p = this.pontoNoMapa(evento);
      if (p) this.gesto.emit({ fase: 'mover', ...p });
      return;
    }
    const toque = this.toqueEmCurso;
    if (toque && toque.ponteiro === evento.pointerId && !toque.moveu
        && Math.hypot(evento.clientX - toque.x, evento.clientY - toque.y) > LIMITE_TOQUE_PX) {
      toque.moveu = true; // virou arrasto da câmera
      clearTimeout(toque.timer);
    }
    const a = this.arrasto;
    if (!a) {
      this.renderizador.domElement.style.cursor = this.tokenSob(evento) ? 'pointer' : '';
      return;
    }
    const ponto = this.pontoNoChao(evento);
    if (!ponto) return;
    if (!a.moveu && Math.hypot(ponto.x - a.inicioX, ponto.z - a.inicioZ) < LIMITE_ARRASTO) return;
    a.moveu = true;
    const lado = a.token.tamanho;
    // o ponteiro leva o centro do token; ele assenta no quadrado mais próximo, sem sair do mapa
    const coluna = Math.min(Math.max(Math.round(ponto.x + a.desvioX - lado / 2), 0), Math.max(0, Math.floor(this.largura() - lado)));
    const linha = Math.min(Math.max(Math.round(ponto.z + a.desvioZ - lado / 2), 0), Math.max(0, Math.floor(this.altura() - lado)));
    const mudou = a.coluna !== coluna || a.linha !== linha || !this.arrastoAvisado;
    a.coluna = coluna;
    a.linha = linha;
    a.vista.grupo.position.set(coluna + lado / 2, 0, linha + lado / 2);
    if (mudou) {
      this.arrastoAvisado = true;
      this.arrastando.emit({ tokenId: a.token.tokenId, coluna, linha }); // o mapa calcula o custo e o alcance a partir disso
    }
  }

  private aoSoltar(evento: PointerEvent, cancelado = false): void {
    if (this.gestoAtivo) {
      this.gestoAtivo = false;
      this.controles.enabled = true;
      if (this.renderizador.domElement.hasPointerCapture(evento.pointerId)) this.renderizador.domElement.releasePointerCapture(evento.pointerId);
      const p = this.pontoNoMapa(evento);
      if (p) this.gesto.emit({ fase: 'fim', ...p });
      return;
    }
    const toque = this.toqueEmCurso;
    if (toque && toque.ponteiro === evento.pointerId) {
      this.cancelarToque();
      if (!cancelado && !toque.moveu && !toque.pingou) {
        const p = this.pontoNoMapa(evento);
        if (p) this.toque.emit(p);
      }
    }
    const a = this.arrasto;
    this.arrasto = null;
    this.controles.enabled = true;
    if (this.renderizador.domElement.hasPointerCapture(evento.pointerId)) this.renderizador.domElement.releasePointerCapture(evento.pointerId);
    if (!a || !a.moveu) return;
    this.arrastoAvisado = false;
    this.arrastando.emit(null);
    // volta ao lugar de antes; se o movimento valer, o mapa atualiza o token e a posição nova vem de lá
    const lado = a.token.tamanho;
    a.vista.grupo.position.set(a.token.coluna + lado / 2, 0, a.token.linha + lado / 2);
    if (a.coluna !== a.token.coluna || a.linha !== a.token.linha) this.mover.emit({ token: a.token, coluna: a.coluna, linha: a.linha });
  }

  // ---------- luz dos tokens ----------

  /** Cada token com raio de visão vira uma luz de verdade: ilumina o chão ao redor e as paredes projetam sombra. */
  private atualizarLuz(v: VistaDoToken, t: TokenCena): void {
    const T = this.T;
    // o raio conta a partir da borda do token, como a névoa do 2D (5 pés = 1 quadrado)
    const raio = t.visao > 0 && !t.oculto ? t.visao / 5 + t.tamanho / 2 : 0;
    if (raio <= 0) {
      if (v.luz) { v.grupo.remove(v.luz); v.luz.dispose(); v.luz = null; }
      return;
    }
    if (!v.luz) {
      const luz = new T.PointLight(0xffc98a, 1, raio, 1.2);
      luz.position.set(0, 0.7, 0); // abaixo do topo das paredes, para elas projetarem sombra
      luz.castShadow = this.contarSombras() < SOMBRAS_MAX; // decidido na criação: trocar depois recompilaria os materiais
      luz.shadow.mapSize.set(512, 512);
      luz.shadow.bias = -0.004;
      luz.shadow.camera.near = 0.15;
      v.grupo.add(luz);
      v.luz = luz;
    }
    v.luz.distance = raio;
    v.luz.intensity = 1.1 * Math.pow(raio, 1.2);
    v.luz.shadow.camera.far = raio + 1;
  }

  private contarSombras(): number {
    let n = 0;
    for (const v of this.vistas.values()) if (v.luz?.castShadow) n++;
    return n;
  }

  private aplicarAmbiente(escuro: boolean): void {
    this.ambiente.intensity = escuro ? 0.2 : 0.75;
    this.sol.intensity = escuro ? 0.18 : 1.6;
  }

  // ---------- régua e custo do arrasto ----------

  private montarReguas(reguas: Regua3d[]): void {
    const T = this.T;
    this.limparGrupo(this.reguasGrupo);
    for (const r of reguas) {
      const x1 = r.c1 + 0.5, z1 = r.l1 + 0.5, x2 = r.c2 + 0.5, z2 = r.l2 + 0.5;
      const cor = this.corDoTema(r.minha ? 'var(--hi)' : 'var(--accent)');
      const material = () => new T.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.95, depthTest: false });
      const comprimento = Math.hypot(x2 - x1, z2 - z1);

      const grupo = new T.Group();
      grupo.position.set((x1 + x2) / 2, 0.08, (z1 + z2) / 2);
      grupo.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      grupo.renderOrder = 20;
      if (comprimento > 0) {
        const faixa = new T.Mesh(new T.PlaneGeometry(comprimento, 0.12), material());
        faixa.rotation.x = -Math.PI / 2;
        faixa.renderOrder = 20;
        grupo.add(faixa);
      }
      for (const lado of [-1, 1]) {
        const ponta = new T.Mesh(new T.CircleGeometry(0.2, 24), material());
        ponta.rotation.x = -Math.PI / 2;
        ponta.renderOrder = 21;
        ponta.position.set((lado * comprimento) / 2, 0, 0); // extremidades, no sistema do grupo girado
        grupo.add(ponta);
      }
      this.reguasGrupo.add(grupo);

      if (comprimento > 0) {
        const rotulo = this.criarRotulo(r.texto, cor);
        rotulo.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
        this.reguasGrupo.add(rotulo);
      }
    }
  }

  private montarRotuloDoCusto(custo: CustoDoArrasto3d | null): void {
    if (this.rotuloDoCusto) {
      this.cenario.remove(this.rotuloDoCusto);
      this.liberarSprite(this.rotuloDoCusto);
      this.rotuloDoCusto = null;
    }
    if (!custo) return;
    const rotulo = this.criarRotulo(custo.texto, this.corDoTema(custo.ok ? 'var(--hi)' : 'var(--danger)'));
    rotulo.position.set(custo.x, 1.9, custo.z);
    this.cenario.add(rotulo);
    this.rotuloDoCusto = rotulo;
  }

  /** Um rótulo de texto que sempre encara a câmera e aparece por cima de tudo. */
  private criarRotulo(texto: string, cor: number): Sprite {
    const T = this.T;
    const tela = document.createElement('canvas');
    const c = tela.getContext('2d')!;
    const fonte = '700 44px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.font = fonte;
    const largura = Math.ceil(c.measureText(texto).width) + 44;
    tela.width = largura;
    tela.height = 76;
    c.font = fonte;
    c.fillStyle = '#' + this.corDoTema('var(--surface)').toString(16).padStart(6, '0');
    c.globalAlpha = 0.94;
    c.beginPath();
    c.roundRect(3, 3, largura - 6, 70, 18);
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = 5;
    c.strokeStyle = '#' + cor.toString(16).padStart(6, '0');
    c.stroke();
    c.fillStyle = '#' + this.corDoTema('var(--fg)').toString(16).padStart(6, '0');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(texto, largura / 2, 40);
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: textura, transparent: true, depthTest: false }));
    sprite.scale.set((0.55 * largura) / 76, 0.55, 1);
    sprite.renderOrder = 30;
    return sprite;
  }

  private liberarSprite(s: Sprite): void {
    const material = s.material as SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }

  private limparGrupo(grupo: Group): void {
    for (const filho of [...grupo.children]) {
      if ((filho as Sprite).isSprite) this.liberarSprite(filho as Sprite);
      else filho.traverse(o => this.liberar(o));
    }
    grupo.clear();
  }

  // ---------- desenho livre ----------

  /** Os traços vão para uma canvas do tamanho do mapa (reduzida se for grande) e ela vira uma camada sobre o chão. */
  private desenharTracos(tracos: Traco3d[], cena: Cena): void {
    if (!tracos.length) { this.atualizarCamada('tracos', null, 0.035, 6, 1); return; }
    const escala = Math.min(1, LADO_MAXIMO_DOS_TRACOS / Math.max(cena.largura, cena.altura, 1));
    const tela = this.telaDosTracos ?? (this.telaDosTracos = document.createElement('canvas'));
    const largura = Math.max(1, Math.ceil(cena.largura * escala)), altura = Math.max(1, Math.ceil(cena.altura * escala));
    if (tela.width !== largura || tela.height !== altura) { tela.width = largura; tela.height = altura; }
    const c = tela.getContext('2d')!;
    c.clearRect(0, 0, largura, altura);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.shadowColor = 'rgba(0, 0, 0, 0.8)';
    c.shadowBlur = 2;
    const cores = new Map<CorToken, string>();
    for (const t of tracos) {
      if (t.pontos.length < 2) continue;
      if (!cores.has(t.cor)) cores.set(t.cor, '#' + this.corDoTema(COR_DO_TOKEN[t.cor] ?? COR_DO_TOKEN.ouro).toString(16).padStart(6, '0'));
      c.strokeStyle = cores.get(t.cor)!;
      c.lineWidth = Math.max(1, t.espessura * escala);
      c.beginPath();
      t.pontos.forEach(([x, y], i) => (i === 0 ? c.moveTo(x * escala, y * escala) : c.lineTo(x * escala, y * escala)));
      c.stroke();
    }
    this.atualizarCamada('tracos', tela, 0.035, 6, 1);
  }

  // ---------- área de magia ----------

  private montarArea(area: Area3d | null): void {
    const T = this.T;
    this.limparGrupo(this.areaGrupo);
    if (!area) return;
    const cor = this.corDoTema('var(--accent)');
    const altura = 0.06;
    const preenchimento = new T.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, side: T.DoubleSide });
    const contorno = new T.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.95, depthTest: false });

    let borda: [number, number][];
    let geometria: BufferGeometry;
    if (area.tipo === 'circulo') {
      const { cx, cz, r } = area;
      geometria = new T.CircleGeometry(r, 72);
      geometria.rotateX(-Math.PI / 2);
      geometria.translate(cx, 0, cz);
      borda = Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as [number, number];
      });
    } else {
      // a forma é desenhada em (x, -z) e deitada no chão: assim cai em (x, 0, z)
      const forma = new T.Shape(area.pontos.map(([x, z]) => new T.Vector2(x, -z)));
      geometria = new T.ShapeGeometry(forma);
      geometria.rotateX(-Math.PI / 2);
      borda = area.pontos;
    }
    const malha = new T.Mesh(geometria, preenchimento);
    malha.position.y = altura;
    malha.renderOrder = 15;
    const linha = new T.LineLoop(new T.BufferGeometry().setFromPoints(borda.map(([x, z]) => new T.Vector3(x, altura, z))), contorno);
    linha.renderOrder = 16;
    const rotulo = this.criarRotulo(area.texto, cor);
    rotulo.position.set(area.rx, 0.8, area.rz);
    this.areaGrupo.add(malha, linha, rotulo);
  }

  // ---------- pings ----------

  private sincronizarPings(pings: Ping3d[]): void {
    const T = this.T;
    const vivos = new Set(pings.map(p => p.chave));
    for (const [chave, p] of this.pingsVistos) {
      if (vivos.has(chave)) continue;
      this.limparGrupo(p.grupo);
      this.cenario.remove(p.grupo);
      this.pingsVistos.delete(chave);
    }
    const cor = this.corDoTema('var(--hi)');
    for (const p of pings) {
      if (this.pingsVistos.has(p.chave)) continue;
      const grupo = new T.Group();
      grupo.position.set(p.x, 0.07, p.z);
      const aneis = [0, 1].map(() => {
        const g = new T.RingGeometry(0.85, 1, 48);
        g.rotateX(-Math.PI / 2);
        const anel = new T.Mesh(g, new T.MeshBasicMaterial({ color: cor, transparent: true, depthTest: false, depthWrite: false }));
        anel.renderOrder = 25;
        grupo.add(anel);
        return anel;
      });
      const pg = new T.CircleGeometry(0.16, 24);
      pg.rotateX(-Math.PI / 2);
      const ponto = new T.Mesh(pg, new T.MeshBasicMaterial({ color: cor, depthTest: false }));
      ponto.renderOrder = 26;
      // um pino em pé, para o ping ser visto de longe e de qualquer ângulo
      const haste = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.1, 8), new T.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85 }));
      haste.position.y = 0.55;
      const rotulo = this.criarRotulo(p.nome, cor);
      rotulo.position.y = 1.45;
      grupo.add(ponto, haste, rotulo);
      this.cenario.add(grupo);
      this.pingsVistos.set(p.chave, { grupo, aneis, inicio: performance.now() });
    }
  }

  // ---------- o que o Mestre está puxando: parede e névoa ----------

  private montarRascunho(parede: RascunhoDeParede3d | null, nevoa: RetanguloDeNevoa3d | null): void {
    const T = this.T;
    this.limparGrupo(this.rascunhoGrupo);
    const cor = this.corDoTema('var(--hi)');
    const material = () => new T.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.55, depthWrite: false });

    if (parede) {
      const dx = parede.x2 - parede.x1, dz = parede.y2 - parede.y1;
      const comprimento = Math.hypot(dx, dz);
      for (const [x, z] of [[parede.x1, parede.y1], [parede.x2, parede.y2]]) {
        const g = new T.CircleGeometry(0.14, 20);
        g.rotateX(-Math.PI / 2);
        const ponta = new T.Mesh(g, material());
        ponta.position.set(x, 0.05, z);
        this.rascunhoGrupo.add(ponta);
      }
      if (comprimento > 0) {
        const alto = parede.tipo === 'janela' ? 0.9 : parede.tipo === 'porta' ? ALTURA_PORTA : ALTURA_PAREDE;
        const caixa = new T.Mesh(new T.BoxGeometry(comprimento, alto, 0.14), material());
        caixa.position.set((parede.x1 + parede.x2) / 2, alto / 2, (parede.y1 + parede.y2) / 2);
        caixa.rotation.y = -Math.atan2(dz, dx);
        this.rascunhoGrupo.add(caixa);
      }
    }

    if (nevoa) {
      const corNevoa = nevoa.cobrindo ? this.corDoTema('var(--muted)') : cor;
      const g = new T.PlaneGeometry(nevoa.largura, nevoa.altura);
      g.rotateX(-Math.PI / 2);
      const placa = new T.Mesh(g, new T.MeshBasicMaterial({ color: corNevoa, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }));
      placa.position.set(nevoa.coluna + nevoa.largura / 2, 0.05, nevoa.linha + nevoa.altura / 2);
      placa.renderOrder = 15;
      const x0 = nevoa.coluna, z0 = nevoa.linha, x1 = x0 + nevoa.largura, z1 = z0 + nevoa.altura;
      const borda = new T.LineLoop(
        new T.BufferGeometry().setFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new T.Vector3(x, 0.05, z))),
        new T.LineBasicMaterial({ color: corNevoa, depthTest: false }),
      );
      borda.renderOrder = 16;
      this.rascunhoGrupo.add(placa, borda);
    }
  }

  // ---------- cores do tema ----------

  /** Resolve uma cor CSS (inclusive `var(--x)` e `color-mix`) para um número 0xRRGGBB, respeitando o tema ativo. */
  private corDoTema(expressao: string): number {
    const el = this.host.nativeElement;
    const amostra = document.createElement('span');
    amostra.style.color = expressao;
    amostra.style.display = 'none';
    el.appendChild(amostra);
    const resolvida = getComputedStyle(amostra).color;
    amostra.remove();
    const tela = this.canvasDeCor ?? (this.canvasDeCor = document.createElement('canvas'));
    tela.width = tela.height = 1;
    const c = tela.getContext('2d', { willReadFrequently: true })!;
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = '#000';
    c.fillStyle = resolvida;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    return (r << 16) | (g << 8) | b;
  }

  private canvasDeCor: HTMLCanvasElement | null = null;
}

