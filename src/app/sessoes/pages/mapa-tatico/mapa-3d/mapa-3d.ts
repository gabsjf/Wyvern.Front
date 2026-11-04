import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import type {
  AmbientLight, CanvasTexture, DirectionalLight, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PointLight, Raycaster, Scene, Sprite, SpriteMaterial, WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cena, CorToken, Parede, TokenCena } from '../../../models/cena';
import { iniciais } from '../../../utils/mapa-geometria';

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

export interface PontoDeRegua3d {
  fase: 'inicio' | 'mover';
  coluna: number;
  linha: number;
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

interface VistaDaParede {
  grupo: Group;
  /** centro em quadrados, para esconder portas e janelas que caem sob a névoa */
  cx: number;
  cy: number;
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
    <p class="dica">Arraste o fundo para andar · botão direito gira · roda aproxima</p>
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
  readonly ferramenta = input<'mover' | 'regua'>('mover');
  readonly reguas = input<Regua3d[]>([]);
  readonly custo = input<CustoDoArrasto3d | null>(null);
  /** Sob névoa, os jogadores ficam no escuro e só a luz dos tokens ilumina. */
  readonly escuro = input(false);

  readonly selecionar = output<TokenCena>();
  readonly mover = output<MovimentoDe3d>();
  readonly falhou = output<void>();
  readonly arrastando = output<ArrastoDe3d | null>();
  readonly reguaPonto = output<PontoDeRegua3d>();

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
  private rotuloDoCusto: Sprite | null = null;
  private ambiente!: AmbientLight;
  private gestoDeRegua = false;
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
      this.cenario.add(this.reguasGrupo);
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
      dom.addEventListener('pointercancel', e => this.aoSoltar(e));

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

    for (const p of paredes) {
      // os jogadores só enxergam portas e janelas, como no mapa 2D
      if (!mestre && !p.porta && !p.janela) continue;
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
      this.paredesVistas.push({ grupo: g, cx: (p.x1 + p.x2) / 2, cy: (p.y1 + p.y2) / 2, escondivel: !mestre });
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

  /** Para os jogadores, portas e janelas cobertas pela névoa não aparecem (senão entregariam o que ela esconde). */
  private esconderSobNevoa(cena: Cena): void {
    const canvas = this.neblina();
    const contexto = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    for (const v of this.paredesVistas) {
      if (!v.escondivel || !canvas || !contexto || canvas.width === 0) { v.grupo.visible = true; continue; }
      const escala = canvas.width / cena.largura;
      const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(v.cx * cena.tamanhoCelula * escala)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(v.cy * cena.tamanhoCelula * escala)));
      v.grupo.visible = contexto.getImageData(px, py, 1, 1).data[3] < 200;
    }
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

  private raio(evento: PointerEvent): Raycaster {
    const T = this.T;
    const r = this.renderizador.domElement.getBoundingClientRect();
    const ndc = new T.Vector2(((evento.clientX - r.left) / r.width) * 2 - 1, -(((evento.clientY - r.top) / r.height) * 2 - 1));
    const raio = new T.Raycaster();
    raio.setFromCamera(ndc, this.camera);
    return raio;
  }

  private tokenSob(evento: PointerEvent): { token: TokenCena; vista: VistaDoToken } | null {
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

  private pontoNoChao(evento: PointerEvent): { x: number; z: number } | null {
    const T = this.T;
    const ponto = new T.Vector3();
    const plano = new T.Plane(new T.Vector3(0, 1, 0), 0);
    return this.raio(evento).ray.intersectPlane(plano, ponto) ? { x: ponto.x, z: ponto.z } : null;
  }

  /** O quadrado sob o ponteiro, dentro do mapa. */
  private quadradoSob(evento: PointerEvent): { coluna: number; linha: number } | null {
    const ponto = this.pontoNoChao(evento);
    if (!ponto) return null;
    return {
      coluna: Math.min(Math.max(Math.floor(ponto.x), 0), Math.max(0, Math.ceil(this.largura()) - 1)),
      linha: Math.min(Math.max(Math.floor(ponto.z), 0), Math.max(0, Math.ceil(this.altura()) - 1)),
    };
  }

  private aoApertar(evento: PointerEvent): void {
    if (evento.button !== 0) return;
    if (this.ferramenta() === 'regua') {
      const q = this.quadradoSob(evento);
      if (!q) return;
      this.gestoDeRegua = true;
      this.controles.enabled = false;
      this.renderizador.domElement.setPointerCapture(evento.pointerId);
      this.reguaPonto.emit({ fase: 'inicio', ...q });
      return;
    }
    const sob = this.tokenSob(evento);
    if (!sob) return;
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

  private aoMover(evento: PointerEvent): void {
    if (this.gestoDeRegua) {
      const q = this.quadradoSob(evento);
      if (q) this.reguaPonto.emit({ fase: 'mover', ...q });
      return;
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

  private aoSoltar(evento: PointerEvent): void {
    if (this.gestoDeRegua) {
      this.gestoDeRegua = false;
      this.controles.enabled = true;
      if (this.renderizador.domElement.hasPointerCapture(evento.pointerId)) this.renderizador.domElement.releasePointerCapture(evento.pointerId);
      return;
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

