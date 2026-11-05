import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, inject, signal, viewChild,
} from '@angular/core';
import type {
  CanvasTexture, Group, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PointLight, Points, Scene, WebGLRenderer,
} from 'three';

type Three = typeof import('three');

const LARGURA = 28; // em quadrados da grade
const ALTURA = 18;
const ALTURA_PAREDE = 1.5;
const GIRO = 0.045; // rad/s: uma volta a cada ~2 minutos
const ALVO = { x: 14, z: 9 };
const VELOCIDADE_DO_HEROI = 1.4; // quadrados por segundo
const PAUSA_DO_HEROI = 2.5; // s parado em cada ponta do caminho

/** Segmentos de parede em quadrados: x1, z1, x2, z2. As lacunas entre eles são as portas. */
const PAREDES: readonly (readonly [number, number, number, number])[] = [
  [2, 2, 26, 2], [26, 2, 26, 16], [26, 16, 2, 16], [2, 16, 2, 2],
  [10, 2, 10, 7], [10, 9, 10, 16],
  [18, 2, 18, 5], [18, 8, 18, 16],
  [18, 9, 21, 9], [23, 9, 26, 9],
];
const PORTAS: readonly (readonly [number, number, number, number])[] = [[10, 7, 10, 9], [18, 5, 18, 8], [21, 9, 23, 9]];

/** Ordem pensada para que, em tela pequena, as primeiras tochas já iluminem o mapa todo. */
const TOCHAS: readonly (readonly [number, number])[] = [[14, 4], [3.5, 14.5], [24.5, 14.5], [3.5, 3.5], [24.5, 3.5], [14, 14]];
const COLUNAS: readonly (readonly [number, number])[] = [[5, 5], [8, 5], [5, 14], [8, 14]];

const OURO = '#d4a94f';
const CARMIM = '#b23a48';

interface FiguraDef { sigla: string; cor: string; x: number; z: number }
const AVENTUREIROS: readonly FiguraDef[] = [
  { sigla: 'AR', cor: OURO, x: 5.5, z: 11.2 },
  { sigla: 'TH', cor: OURO, x: 7.2, z: 12.4 },
];
const INIMIGOS: readonly FiguraDef[] = [
  { sigla: 'OR', cor: CARMIM, x: 24, z: 12 },
  { sigla: 'GB', cor: CARMIM, x: 22.8, z: 14.4 },
  { sigla: 'KO', cor: CARMIM, x: 21, z: 3.8 },
];
const PERCURSO: readonly (readonly [number, number])[] = [[4, 8], [14, 8], [16, 6.5], [21, 6.5], [22, 9], [21.5, 11.5]];

interface Figura { grupo: Group; cartao: Mesh; fase: number }
interface Tocha { luz: PointLight; chama: Mesh; base: number; fase: number }

/**
 * Um mapa em 3D girando devagar atrás do topo da página inicial: o mesmo visual do mapa tático (cartões em pé,
 * paredes, luz que sai dos tokens), mas numa masmorra montada aqui mesmo, sem depender de login nem de servidor.
 * É só enfeite: o Three.js é baixado depois da primeira renderização e, se o WebGL falhar, a página segue com o fundo de sempre.
 */
@Component({
  selector: 'app-landing-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (!falhou()) { <div #area class="area" aria-hidden="true"></div> }`,
  styleUrl: './landing-mapa.scss',
})
export class LandingMapa {
  protected readonly falhou = signal(false);

  private readonly area = viewChild<ElementRef<HTMLElement>>('area');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zona = inject(NgZone);

  private T!: Three;
  private cenario!: Scene;
  private camera!: PerspectiveCamera;
  private renderizador!: WebGLRenderer;
  private observadorDeTamanho?: ResizeObserver;
  private observadorDeVisao?: IntersectionObserver;
  private destruido = false;
  private visivel = true;
  private readonly movimentoReduzido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly toque = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  private readonly tochas: Tocha[] = [];
  private readonly figuras: Figura[] = [];
  private heroi!: Figura;
  private anel!: Mesh;
  private poeira!: Points;
  private distancia = 20;
  private inicio = 0;
  private ultimo = 0;
  private readonly ouvinteDeVisibilidade = () => this.atualizarLaco();

  constructor() {
    afterNextRender(() => void this.zona.runOutsideAngular(() => this.iniciar()));
    inject(DestroyRef).onDestroy(() => this.destruir());
  }

  // ---------- ciclo de vida ----------

  private async iniciar(): Promise<void> {
    try {
      const T = await import('three');
      const el = this.area()?.nativeElement;
      if (this.destruido || !el) return;
      this.T = T;

      const renderizador = new T.WebGLRenderer({ antialias: !this.toque, alpha: true, powerPreference: 'high-performance' });
      renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.toque ? 1.25 : 1.75));
      renderizador.setClearColor(0x000000, 0);
      renderizador.outputColorSpace = T.SRGBColorSpace;
      renderizador.toneMapping = T.ACESFilmicToneMapping;
      renderizador.toneMappingExposure = 1.15;
      renderizador.shadowMap.enabled = !this.toque;
      renderizador.shadowMap.type = T.PCFSoftShadowMap;
      el.appendChild(renderizador.domElement);
      this.renderizador = renderizador;

      this.cenario = new T.Scene();
      this.camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
      this.montar();

      this.observadorDeTamanho = new ResizeObserver(() => { this.redimensionar(); if (!this.rodando()) this.desenharQuadro(this.movimentoReduzido ? 9 : this.tempo()); });
      this.observadorDeTamanho.observe(el);
      this.observadorDeVisao = new IntersectionObserver(([e]) => { this.visivel = !!e?.isIntersecting; this.atualizarLaco(); });
      this.observadorDeVisao.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', this.ouvinteDeVisibilidade);

      this.inicio = performance.now();
      this.redimensionar();
      this.desenharQuadro(this.movimentoReduzido ? 9 : 0);
      this.atualizarLaco();
    } catch (erro) {
      console.warn('Mapa 3d da página inicial indisponível', erro);
      this.limpar();
      this.falhou.set(true);
    }
  }

  private destruir(): void {
    this.destruido = true;
    document.removeEventListener('visibilitychange', this.ouvinteDeVisibilidade);
    this.observadorDeTamanho?.disconnect();
    this.observadorDeVisao?.disconnect();
    this.limpar();
  }

  private limpar(): void {
    if (!this.renderizador) return;
    this.renderizador.setAnimationLoop(null);
    this.cenario?.traverse(o => this.liberar(o));
    this.renderizador.dispose();
    this.renderizador.forceContextLoss();
    this.renderizador.domElement.remove();
  }

  private liberar(o: Object3D): void {
    const m = o as Mesh;
    m.geometry?.dispose();
    const material = m.material as (Material & { map?: { dispose(): void } | null }) | (Material & { map?: { dispose(): void } | null })[] | undefined;
    for (const x of Array.isArray(material) ? material : material ? [material] : []) {
      x.map?.dispose();
      x.dispose();
    }
  }

  private rodando(): boolean {
    return !this.movimentoReduzido && this.visivel && !document.hidden && !this.destruido;
  }

  /** Só anima enquanto o topo da página está à vista e a aba está aberta: de resto o mapa fica parado e não gasta nada. */
  private atualizarLaco(): void {
    if (!this.renderizador) return;
    if (this.rodando()) {
      this.ultimo = performance.now();
      this.renderizador.setAnimationLoop(agora => this.laco(agora));
    } else {
      this.renderizador.setAnimationLoop(null);
    }
  }

  private tempo(): number { return (performance.now() - this.inicio) / 1000; }

  private laco(agora: number): void {
    const dt = Math.min((agora - this.ultimo) / 1000, 0.1);
    this.ultimo = agora;
    this.desenharQuadro((agora - this.inicio) / 1000, dt);
  }

  private redimensionar(): void {
    const el = this.area()?.nativeElement;
    if (!el || !this.renderizador) return;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderizador.setSize(w, h, false);
    this.renderizador.domElement.style.width = '100%';
    this.renderizador.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // em tela larga o mapa preenche a largura; em tela estreita a câmera recua para ele não ficar cortado demais
    const tg = Math.tan((this.camera.fov * Math.PI) / 360);
    this.distancia = Math.min(Math.max(11 / (tg * this.camera.aspect), 17), 40);
  }

  // ---------- quadro ----------

  private desenharQuadro(t: number, dt = 0): void {
    const angulo = 0.7 + t * GIRO;
    const polar = 0.95 + Math.sin(t * 0.2) * 0.05;
    const r = this.distancia;
    this.camera.position.set(
      ALVO.x + Math.sin(angulo) * Math.sin(polar) * r,
      Math.cos(polar) * r,
      ALVO.z + Math.cos(angulo) * Math.sin(polar) * r,
    );
    this.camera.lookAt(ALVO.x, 0, ALVO.z);

    for (const f of this.tochas) {
      const tremor = 0.88 + 0.12 * Math.sin(t * 9 + f.fase) * Math.sin(t * 5.3 + f.fase * 2);
      f.luz.intensity = f.base * tremor;
      f.chama.scale.setScalar(0.9 + 0.2 * tremor);
    }

    this.moverHeroi(t);
    for (const f of this.figuras) {
      // o cartão em pé encara a câmera, só girando no eixo vertical, como no mapa tático
      f.cartao.rotation.y = Math.atan2(this.camera.position.x - f.grupo.position.x, this.camera.position.z - f.grupo.position.z);
      f.cartao.position.y = 0.1 + 0.55 + Math.sin(t * 1.6 + f.fase) * 0.02;
    }
    this.anel.position.set(this.heroi.grupo.position.x, 0.12, this.heroi.grupo.position.z);
    this.anel.scale.setScalar(1 + Math.sin(t * 4) * 0.06);

    this.moverPoeira(dt);
    this.renderizador.render(this.cenario, this.camera);
  }

  /** O aventureiro anda pelas portas até os inimigos, para um instante e volta, em vai-e-vem. */
  private moverHeroi(t: number): void {
    const trechos = PERCURSO.slice(1).map((p, i) => Math.hypot(p[0] - PERCURSO[i]![0], p[1] - PERCURSO[i]![1]));
    const total = trechos.reduce((a, b) => a + b, 0);
    const ida = total / VELOCIDADE_DO_HEROI;
    const ciclo = 2 * (ida + PAUSA_DO_HEROI);
    const c = t % ciclo;
    let frac: number;
    if (c < ida) frac = c / ida;
    else if (c < ida + PAUSA_DO_HEROI) frac = 1;
    else if (c < 2 * ida + PAUSA_DO_HEROI) frac = 1 - (c - ida - PAUSA_DO_HEROI) / ida;
    else frac = 0;

    let resto = frac * total;
    for (let i = 0; i < trechos.length; i++) {
      const tr = trechos[i]!;
      if (resto <= tr || i === trechos.length - 1) {
        const k = tr === 0 ? 0 : Math.min(resto / tr, 1);
        const a = PERCURSO[i]!, b = PERCURSO[i + 1]!;
        this.heroi.grupo.position.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k);
        return;
      }
      resto -= tr;
    }
  }

  private moverPoeira(dt: number): void {
    const pos = this.poeira.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * (0.1 + (i % 5) * 0.03);
      if (y > 3) y = 0.1;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(y * 2 + i) * dt * 0.05);
    }
    pos.needsUpdate = true;
  }

  // ---------- cena ----------

  private montar(): void {
    const T = this.T;
    const sombras = !this.toque;

    this.cenario.add(new T.HemisphereLight(0x9a8a78, 0x1a1512, 0.75));
    const lua = new T.DirectionalLight(0x8fa6d6, 0.35);
    lua.position.set(-10, 20, 25);
    this.cenario.add(lua);

    // chão: lajes na grade do mapa; fora das salas a textura é transparente e o recorte (alphaTest) as deixa ilhadas
    const chaoGeo = new T.PlaneGeometry(LARGURA, ALTURA);
    chaoGeo.rotateX(-Math.PI / 2);
    const chao = new T.Mesh(chaoGeo, new T.MeshStandardMaterial({ map: this.texturaDoChao(), alphaTest: 0.5, roughness: 0.95, metalness: 0 }));
    chao.position.set(LARGURA / 2, 0, ALTURA / 2);
    chao.receiveShadow = sombras;
    this.cenario.add(chao);

    const pontos: number[] = [];
    for (let x = 2; x <= 26; x++) pontos.push(x, 0.01, 2, x, 0.01, 16);
    for (let z = 2; z <= 16; z++) pontos.push(2, 0.01, z, 26, 0.01, z);
    const gradeGeo = new T.BufferGeometry();
    gradeGeo.setAttribute('position', new T.Float32BufferAttribute(pontos, 3));
    this.cenario.add(new T.LineSegments(gradeGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false })));

    const pedra = new T.MeshStandardMaterial({ color: 0x6a6058, roughness: 0.9 });
    const topo = new T.MeshStandardMaterial({ color: 0x8c8074, roughness: 0.8 });
    const madeira = new T.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 });

    const caixa = (l: number, a: number, e: number, material: Material, x: number, y: number, z: number, giro = 0): Mesh => {
      const m = new T.Mesh(new T.BoxGeometry(l, a, e), material);
      m.position.set(x, y + a / 2, z);
      m.rotation.y = giro;
      m.castShadow = sombras;
      m.receiveShadow = sombras;
      this.cenario.add(m);
      return m;
    };

    for (const [x1, z1, x2, z2] of PAREDES) {
      const comp = Math.hypot(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, giro = -Math.atan2(z2 - z1, x2 - x1);
      caixa(comp + 0.3, ALTURA_PAREDE, 0.3, pedra, cx, 0, cz, giro);
      caixa(comp + 0.34, 0.08, 0.38, topo, cx, ALTURA_PAREDE, cz, giro); // o capeamento marca a borda da parede
    }
    for (const [x1, z1, x2, z2] of PORTAS) {
      const comp = Math.hypot(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, giro = -Math.atan2(z2 - z1, x2 - x1);
      caixa(0.18, 1.2, 0.2, madeira, x1, 0, z1, giro);
      caixa(0.18, 1.2, 0.2, madeira, x2, 0, z2, giro);
      caixa(comp + 0.2, 0.14, 0.22, madeira, cx, 1.2, cz, giro);
    }

    for (const [x, z] of COLUNAS) {
      const col = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, ALTURA_PAREDE, 14), pedra);
      col.position.set(x, ALTURA_PAREDE / 2, z);
      col.castShadow = sombras;
      col.receiveShadow = sombras;
      this.cenario.add(col);
    }
    caixa(0.9, 0.9, 0.9, madeira, 23.5, 0, 3.6, 0.3);
    caixa(0.7, 0.7, 0.7, madeira, 24.4, 0, 4.4, -0.2);
    for (const [x, z] of [[19.5, 14.8], [20.4, 14.4]] as const) {
      const barril = new T.Mesh(new T.CylinderGeometry(0.38, 0.38, 0.9, 12), madeira);
      barril.position.set(x, 0.45, z);
      barril.castShadow = sombras;
      this.cenario.add(barril);
    }
    const mesa = new T.Mesh(new T.CylinderGeometry(1.3, 1.3, 0.12, 28), madeira);
    mesa.position.set(14, 0.55, 11);
    mesa.castShadow = sombras;
    mesa.receiveShadow = sombras;
    const pe = new T.Mesh(new T.CylinderGeometry(0.2, 0.3, 0.5, 10), madeira);
    pe.position.set(14, 0.25, 11);
    this.cenario.add(mesa, pe);

    this.montarTochas(Math.min(this.toque ? 3 : TOCHAS.length, TOCHAS.length));
    this.montarFiguras(sombras);
    this.montarPoeira();
  }

  private montarTochas(n: number): void {
    const T = this.T;
    const poste = new T.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.8 });
    TOCHAS.slice(0, n).forEach(([x, z], i) => {
      const haste = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 1.0, 8), poste);
      haste.position.set(x, 0.5, z);
      const chama = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), new T.MeshBasicMaterial({ color: 0xffb35c }));
      chama.position.set(x, 1.1, z);
      const luz = new T.PointLight(0xff9a45, 30, 11, 1.5);
      luz.position.set(x, 1.3, z);
      this.cenario.add(haste, chama, luz);
      this.tochas.push({ luz, chama, base: 30, fase: i * 1.7 });
    });
  }

  private montarFiguras(sombras: boolean): void {
    const T = this.T;
    const criar = (def: FiguraDef, indice: number): Figura => {
      const grupo = new T.Group();
      grupo.position.set(def.x, 0, def.z);
      const base = new T.Mesh(
        new T.CylinderGeometry(0.44, 0.48, 0.1, 32),
        new T.MeshStandardMaterial({ color: def.cor, roughness: 0.55, metalness: 0.15 }),
      );
      base.position.y = 0.05;
      base.castShadow = sombras;
      const cartao = new T.Mesh(
        new T.PlaneGeometry(0.8, 1.1),
        new T.MeshBasicMaterial({ map: this.texturaDoCartao(def), transparent: true, side: T.DoubleSide, alphaTest: 0.02 }),
      );
      grupo.add(base, cartao);
      this.cenario.add(grupo);
      const figura = { grupo, cartao, fase: indice * 1.3 };
      this.figuras.push(figura);
      return figura;
    };
    [...AVENTUREIROS, ...INIMIGOS].forEach((d, i) => criar(d, i));

    // quem anda carrega a própria luz, como o raio de visão dos tokens no mapa tático
    this.heroi = criar({ sigla: 'KA', cor: OURO, x: PERCURSO[0]![0], z: PERCURSO[0]![1] }, 9);
    const luz = new T.PointLight(0xffd9a0, 26, 9, 1.5);
    luz.position.set(0, 0.8, 0);
    luz.castShadow = sombras;
    luz.shadow.mapSize.set(512, 512);
    luz.shadow.bias = -0.004;
    luz.shadow.camera.near = 0.15;
    this.heroi.grupo.add(luz);

    const aroGeo = new T.RingGeometry(0.62, 0.7, 48);
    aroGeo.rotateX(-Math.PI / 2);
    this.anel = new T.Mesh(aroGeo, new T.MeshBasicMaterial({ color: OURO, transparent: true, opacity: 0.95, depthWrite: false }));
    this.cenario.add(this.anel);
  }

  private montarPoeira(): void {
    const T = this.T;
    const n = this.toque ? 50 : 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 2 + Math.random() * 24;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = 2 + Math.random() * 14;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    this.poeira = new T.Points(geo, new T.PointsMaterial({
      color: 0xffc98a, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending,
    }));
    this.cenario.add(this.poeira);
  }

  // ---------- texturas ----------

  private texturaDoChao(): CanvasTexture {
    const T = this.T;
    const px = 32;
    const tela = document.createElement('canvas');
    tela.width = LARGURA * px;
    tela.height = ALTURA * px;
    const c = tela.getContext('2d')!;
    let semente = 7; // sorteio fixo: o chão é o mesmo a cada visita
    const sorteio = (): number => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

    for (let l = 2; l < 16; l++) {
      for (let col = 2; col < 26; col++) {
        const tom = 19 + sorteio() * 10;
        c.fillStyle = `hsl(26 14% ${tom}%)`;
        c.fillRect(col * px, l * px, px, px);
        c.fillStyle = `hsl(26 10% ${tom + 9}% / 0.22)`;
        c.fillRect(col * px + sorteio() * 18, l * px + sorteio() * 18, 6 + sorteio() * 10, 4 + sorteio() * 8);
        c.strokeStyle = 'hsl(24 20% 8% / 0.9)';
        c.lineWidth = 2;
        c.strokeRect(col * px + 1, l * px + 1, px - 2, px - 2);
      }
    }
    // círculo ritual sob a mesa, em ouro, na cor de destaque do sistema
    c.strokeStyle = 'hsl(41 60% 52% / 0.5)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(14 * px, 11 * px, 2.4 * px, 0, Math.PI * 2); c.stroke();
    c.setLineDash([8, 10]);
    c.beginPath(); c.arc(14 * px, 11 * px, 2.0 * px, 0, Math.PI * 2); c.stroke();

    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    textura.anisotropy = 4;
    return textura;
  }

  /** O cartão do token: borda na cor dele e as iniciais no medalhão, como no mapa tático. */
  private texturaDoCartao(def: FiguraDef): CanvasTexture {
    const T = this.T;
    const larg = 256, alt = 356;
    const tela = document.createElement('canvas');
    tela.width = larg;
    tela.height = alt;
    const c = tela.getContext('2d')!;
    c.beginPath();
    c.roundRect(10, 10, larg - 20, alt - 20, 40);
    c.fillStyle = '#1d1916';
    c.fill();
    c.lineWidth = 14;
    c.strokeStyle = def.cor;
    c.stroke();
    c.save();
    c.beginPath();
    c.arc(larg / 2, alt / 2 - 12, 92, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = def.cor;
    c.globalAlpha = 0.28;
    c.fillRect(0, 0, larg, alt);
    c.restore();
    c.beginPath();
    c.arc(larg / 2, alt / 2 - 12, 92, 0, Math.PI * 2);
    c.lineWidth = 6;
    c.strokeStyle = def.cor;
    c.stroke();
    c.fillStyle = '#ede4d6';
    c.font = '700 84px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(def.sigla, larg / 2, alt / 2 - 8);
    if (def.cor === CARMIM) { c.fillStyle = def.cor; c.fillRect(46, alt - 62, larg - 92, 8); }

    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    textura.anisotropy = 4;
    return textura;
  }
}
