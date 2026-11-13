import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import type {
  AmbientLight, BufferGeometry, CanvasTexture, DirectionalLight, Group, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PointLight, Raycaster, Scene, Sprite, SpriteMaterial, WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Cena, CorToken, ObjetoCena, Parede, TokenCena, TransformacaoDaPeca } from '../../../models/cena';
import { iniciais } from '../../../utils/mapa-geometria';
import { algumLadoRevelado, amostrasDosLados, dividirEmTrechos } from '../../../utils/paredes-3d';
import { quadradosPorUnidade, tamanhoDnd } from '../../../utils/escala-3d';
import { criarLeitorGltf } from '../../../utils/leitor-gltf';

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
const PIXELS_POR_QUADRADO_NA_NEVOA = 4; // resolução da cópia da névoa usada para esconder paredes e peças
const QUADRO_LENTO_MS = 24; // média acima disso (~40 fps) com a câmera andando: baixa a resolução
const QUADRO_DE_ANIMACAO_MS = 33; // só o pulso do turno e os pings mexendo: 30 fps bastam
// o encaixe do editor de cenário (Ctrl segurado solta)
const ENCAIXE_POSICAO = 0.5; // quadrados
const ENCAIXE_GIRO = 15; // graus
const ENCAIXE_ESCALA = 0.25; // quadrados

const graus = (g: number): number => (g * Math.PI) / 180;
const emGraus = (rad: number): number => (rad * 180) / Math.PI;

export type ModoDoGizmo = 'translate' | 'rotate' | 'scale';

/** Um pedaço do .glb (malha + material) com a posição dele dentro do modelo, para desenhar várias cópias de uma vez. */
interface ParteDoModelo {
  geometria: BufferGeometry;
  material: Material | Material[];
  matriz: Matrix4;
}

/** Um .glb já lido: o pé no chão (y = 0) e o meio no centro, com as medidas originais para ajustar a escala. */
interface Prototipo {
  raiz: Object3D;
  largura: number;
  profundidade: number;
  altura: number;
  /** As malhas do modelo, para instanciar; null quando ele tem esqueleto, linhas ou pontos (aí cada peça é um clone). */
  partes: ParteDoModelo[] | null;
}

interface VistaDoObjeto {
  objetoId: number;
  /** Posição e giro da peça; só guarda o clone quando o modelo não dá para instanciar. */
  grupo: Group;
  modeloId: number;
  instancia: Object3D | null;
  prototipo: Prototipo | null;
  dados: TransformacaoDaPeca;
  amostras: [number, number][];
  /** Posição, giro e escala da peça no mapa. */
  matriz: Matrix4;
  visivel: boolean;
}

/** Todas as peças de um mesmo modelo numa só chamada de desenho por malha dele. */
interface LoteDeObjetos {
  malhas: InstancedMesh[];
  capacidade: number;
}

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
  /** Miniatura 3D no lugar do cartão (WYV-26). */
  mini: Object3D | null;
  miniId: number | null;
  miniPrototipo: Prototipo | null;
  /** Escala da miniatura ("Auto", "Impressao", "Real" ou "Encaixar"). */
  miniEscala: string;
  /** Altura da miniatura na mesa, em quadrados (para a barra de vida ficar acima dela). */
  miniAltura: number;
  abatido: boolean;
  /** Para onde a miniatura olha, em graus (sentido horário visto de cima). */
  rotacao: number;
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
  /** as caixas da peça: [material, índice da instância] */
  caixas: [number, number][];
  /** pontos (em quadrados) dos dois lados da peça: para os jogadores, ela só aparece se algum estiver revelado */
  amostras: [number, number][];
  escondivel: boolean;
  visivel: boolean;
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
    @if (editarCenario()) {
      <div class="comandos editor" role="group" aria-label="Editor de cenário">
        <button type="button" class="cmd" [class.ativo]="modoDoGizmo() === 'translate'" (click)="modoDoGizmo.set('translate')"
                [attr.aria-pressed]="modoDoGizmo() === 'translate'" title="Mover a peça (W)" aria-label="Mover a peça">
          <i class="bi bi-arrows-move" aria-hidden="true"></i>
        </button>
        <button type="button" class="cmd" [class.ativo]="modoDoGizmo() === 'rotate'" (click)="modoDoGizmo.set('rotate')"
                [attr.aria-pressed]="modoDoGizmo() === 'rotate'" title="Girar a peça (E)" aria-label="Girar a peça">
          <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
        </button>
        <button type="button" class="cmd" [class.ativo]="modoDoGizmo() === 'scale'" (click)="modoDoGizmo.set('scale')"
                [attr.aria-pressed]="modoDoGizmo() === 'scale'" title="Escalar a peça (R): o cubo do meio escala por igual" aria-label="Escalar a peça">
          <i class="bi bi-arrows-angle-expand" aria-hidden="true"></i>
        </button>
        <button type="button" class="cmd" [class.ativo]="encaixe()" (click)="encaixe.set(!encaixe())" [attr.aria-pressed]="encaixe()"
                title="Encaixe na grade: meio quadrado, 15° e 0,25 de escala (segure Ctrl para soltar)" aria-label="Encaixe na grade">
          <i class="bi bi-magnet" aria-hidden="true"></i>
        </button>
      </div>
    }
    <p class="dica">
      @if (editarCenario() && ferramenta() === 'objeto') { Clique para pôr a peça (em cima de outra, ela empilha) · W move · E gira · R escala · Ctrl solta o encaixe }
      @else if (editarCenario() && ferramenta() === 'mover') { Clique numa peça para editar · W move · E gira · R escala · Del apaga · Ctrl+D duplica · Esc solta }
      @else if (ferramenta() === 'mover') { Arraste o fundo para andar · botão direito gira · roda aproxima · duplo clique chama a mesa }
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
  /** Peças de cenário postas no mapa (WYV-25). */
  readonly objetos = input<ObjetoCena[]>([]);
  /** Busca os bytes de um .glb da biblioteca da campanha (o mapa 2D guarda o cache). */
  readonly arquivoDoModelo = input<((modeloId: number) => Promise<ArrayBuffer>) | null>(null);
  /** A escala de cada modelo da biblioteca (como as medidas do arquivo viram quadrados). */
  readonly escalaDe = input<(modeloId: number) => string>(() => 'Auto');

  readonly selecionar = output<TokenCena>();
  readonly mover = output<MovimentoDe3d>();
  readonly falhou = output<void>();
  readonly arrastando = output<ArrastoDe3d | null>();
  readonly gesto = output<GestoDe3d>();
  /** Duplo clique (ou segurar parado) no chão: "olhem aqui". */
  readonly ping = output<PontoDe3d>();
  /** Clique rápido no chão vazio, com a ferramenta "mover" (abre portas, desmarca o token). */
  readonly toque = output<PontoDe3d>();
  /** Um .glb que não abriu (arquivo estragado ou com compressão que o 3D não lê). */
  readonly modeloFalhou = output<number>();

  // ---------- editor de cenário (só o Mestre) ----------
  /** Liga o editor: clicar numa peça a seleciona e aparece o gizmo para mover, girar e escalar. */
  readonly editarCenario = input(false);
  readonly objetoSelecionadoId = input<number | null>(null);
  /** Clique numa peça (ou no vazio, null). */
  readonly selecionarObjeto = output<number | null>();
  /** Com a ferramenta "Cenário 3D", o ponto onde pôr a peça escolhida (no chão, ou em cima da peça clicada). */
  readonly porObjeto = output<{ x: number; y: number; z: number }>();
  /** O gizmo soltou a peça: a transformação nova. */
  readonly transformarObjeto = output<{ objetoId: number } & TransformacaoDaPeca>();
  readonly apagarObjeto = output<number>();
  readonly duplicarObjeto = output<number>();
  /** O anel do gizmo virou a miniatura do token selecionado (quem pode mover o token pode girá-lo). */
  readonly girarToken = output<{ tokenId: number; rotacao: number }>();

  protected readonly pronto = signal(false);
  protected readonly modoDoGizmo = signal<ModoDoGizmo>('translate');
  protected readonly encaixe = signal(true);
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
  private objetosGrupo!: Group;
  private readonly objetosVistos = new Map<number, VistaDoObjeto>();
  private readonly prototipos = new Map<number, Promise<Prototipo | null>>();
  private clonar: ((o: Object3D) => Object3D) | null = null;
  private readonly pingsVistos = new Map<number, { grupo: Group; aneis: Mesh[]; inicio: number }>();
  private telaDosTracos: HTMLCanvasElement | null = null;
  private rotuloDoCusto: Sprite | null = null;
  private ambiente!: AmbientLight;
  private gestoAtivo = false;
  /** Um clique no chão vazio que ainda pode virar toque, ping (segurando) ou arrasto da câmera. */
  private toqueEmCurso: ToqueNoChao | null = null;
  private arrastoAvisado = false;
  private readonly paredesVistas: VistaDaParede[] = [];
  /** pedra, madeira e vidro: cada um é uma malha só com todas as caixas daquele material */
  private paredesInstancias: ({ malha: InstancedMesh; matrizes: Matrix4[] } | null)[] = [];
  private readonly lotes = new Map<number, LoteDeObjetos>();
  private telaDaNevoa: HTMLCanvasElement | null = null;
  private gizmo: TransformControls | null = null;
  /** O que o gizmo segura: um ponto com a transformação da peça (a peça em si pode ser uma instância de um lote). */
  private alvoDoGizmo!: Object3D;
  /** A caixa em volta da peça selecionada. */
  private contorno!: Object3D;
  /** A peça presa no gizmo agora. */
  private editando: number | null = null;
  /** Ou o token, quando o gizmo é só o anel que vira a miniatura. */
  private editandoToken: number | null = null;
  private arrastandoGizmo = false;
  private ctrlApertado = false;
  private readonly aoTeclar = (e: KeyboardEvent): void => this.teclaDoEditor(e);
  private readonly aoSoltarTecla = (e: KeyboardEvent): void => {
    if (e.key === 'Control' && this.ctrlApertado) { this.ctrlApertado = false; this.aplicarEncaixe(); }
  };
  private readonly vistas = new Map<number, VistaDoToken>();
  private readonly texturas = new Map<string, CanvasTexture>();
  private readonly retratosCarregados = new Map<string, HTMLImageElement>();
  private cenaDesenhada: number | null = null;
  private versaoDaImagem: string | null = null;

  private arrasto: {
    token: TokenCena; vista: VistaDoToken; moveu: boolean; coluna: number; linha: number;
    inicioX: number; inicioZ: number; desvioX: number; desvioZ: number;
  } | null = null;
  private sol!: DirectionalLight;

  // Só desenha quando algo muda (câmera, cena, animação); as sombras, só quando o que as projeta muda: elas não
  // dependem da câmera, e cada luz de token com sombra são seis passadas da cena inteira.
  private sujo = true;
  private sombrasSujas = true;
  private algumTurno = false;
  private ultimoDesenho = 0;
  /** O último movimento do ponteiro sem botão apertado: o cursor de "mão" sobre tokens é conferido uma vez por quadro. */
  private ponteiroParado: PointerEvent | null = null;
  // resolução adaptativa: se a câmera andar abaixo de ~40 fps, a razão de pixels desce até 1
  private razaoDePixels = 1;
  private somaDosQuadros = 0;
  private quadrosMedidos = 0;
  private quadroAnterior = 0;

  constructor() {
    afterNextRender(() => void this.iniciar());
    inject(DestroyRef).onDestroy(() => this.destruir());

    effect(() => {
      if (!this.pronto()) return;
      const cena = this.cena();
      const url = this.imagemUrl();
      untracked(() => { this.montarChao(cena, url); this.redesenhar(true); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const paredes = this.paredes();
      this.ehMestre();
      const cena = this.cena();
      untracked(() => { this.montarParedes(paredes, cena); this.redesenhar(true); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const tokens = this.tokens();
      const selecionado = this.selecionadoId();
      // ler retratos e informações de combate aqui faz o efeito acompanhar o que carrega, vida, turno e abatidos
      const retratos = new Map(tokens.map(t => [t.tokenId, this.retratoDe()(t)]));
      const infos = new Map(tokens.map(t => [t.tokenId, this.infoDe()(t)]));
      this.escalaDe(); // trocar a escala de um modelo redesenha as miniaturas
      untracked(() => { this.sincronizarTokens(tokens, selecionado, infos, retratos); this.redesenhar(true); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const canvas = this.neblina();
      this.versaoNeblina();
      const mestre = this.ehMestre();
      untracked(() => { this.atualizarNevoa(canvas, mestre); this.redesenhar(true); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const canvas = this.alcance();
      this.versaoAlcance();
      untracked(() => { this.atualizarCamada('alcance', canvas, 0.02, 4, 1); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const reguas = this.reguas();
      untracked(() => { this.montarReguas(reguas); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const custo = this.custo();
      untracked(() => { this.montarRotuloDoCusto(custo); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const escuro = this.escuro() || this.escuroManual();
      untracked(() => { this.aplicarAmbiente(escuro); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const tracos = this.tracos();
      const cena = this.cena();
      untracked(() => { this.desenharTracos(tracos, cena); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const area = this.areaDeMagia();
      untracked(() => { this.montarArea(area); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const pings = this.pings();
      untracked(() => { this.sincronizarPings(pings); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const parede = this.rascunhoDeParede();
      const nevoa = this.retanguloDeNevoa();
      untracked(() => { this.montarRascunho(parede, nevoa); this.redesenhar(); });
    });
    effect(() => {
      if (!this.pronto()) return;
      const objetos = this.objetos();
      this.ehMestre();
      untracked(() => { this.sincronizarObjetos(objetos); this.redesenhar(true); });
    });
    effect(() => {
      if (!this.pronto()) return;
      this.editarCenario();
      this.objetoSelecionadoId();
      this.selecionadoId();
      untracked(() => this.atualizarGizmo());
    });
    effect(() => {
      if (!this.pronto()) return;
      this.modoDoGizmo();
      this.encaixe();
      untracked(() => {
        if (this.editandoToken === null) this.aplicarModo(); // o anel do token é sempre só o giro horizontal
        this.aplicarEncaixe();
        this.redesenhar();
      });
    });
  }

  // ---------- ciclo de vida ----------

  private async iniciar(): Promise<void> {
    try {
      const [T, { OrbitControls }, { TransformControls: Gizmo }] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/controls/TransformControls.js'),
      ]);
      if (this.destruido) return;
      this.T = T;

      const el = this.area().nativeElement;
      const renderizador = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.razaoDePixels = Math.min(window.devicePixelRatio || 1, 2);
      renderizador.setPixelRatio(this.razaoDePixels);
      renderizador.shadowMap.enabled = true;
      renderizador.shadowMap.type = T.PCFSoftShadowMap;
      renderizador.shadowMap.autoUpdate = false; // refeitas só quando `sombrasSujas` (ver `quadro`)
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
      this.objetosGrupo = new T.Group();
      this.cenario.add(this.reguasGrupo, this.areaGrupo, this.rascunhoGrupo);
      this.cenario.add(this.objetosGrupo);
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
      c.addEventListener('change', () => { this.limitarAlvo(); this.redesenhar(); });

      const dom = renderizador.domElement;
      dom.style.touchAction = 'none';
      dom.addEventListener('contextmenu', e => e.preventDefault());
      dom.addEventListener('pointerdown', e => this.aoApertar(e));
      dom.addEventListener('pointermove', e => this.aoMover(e));
      dom.addEventListener('pointerup', e => this.aoSoltar(e));
      dom.addEventListener('pointercancel', e => this.aoSoltar(e, true));
      dom.addEventListener('dblclick', e => this.aoDuploClique(e));

      // o gizmo do editor de cenário: criado depois dos ouvintes acima, então `aoApertar` sabe se o ponteiro está nele
      const gizmo = new Gizmo(this.camera, dom);
      gizmo.setSize(0.9);
      gizmo.addEventListener('change', () => this.redesenhar());
      gizmo.addEventListener('objectChange', () => this.aoMexerNoGizmo());
      gizmo.addEventListener('dragging-changed', e => {
        this.arrastandoGizmo = !!e.value;
        this.controles.enabled = !e.value; // segurando o gizmo, a câmera fica parada
        if (!e.value) this.soltarGizmo();
      });
      this.cenario.add(gizmo.getHelper());
      this.gizmo = gizmo;
      this.alvoDoGizmo = new T.Object3D();
      this.alvoDoGizmo.rotation.order = 'YXZ';
      this.cenario.add(this.alvoDoGizmo);
      this.contorno = new T.LineSegments(
        new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)),
        new T.LineBasicMaterial({ color: this.corDoTema('var(--hi)'), transparent: true, opacity: 0.9, depthTest: false }),
      );
      this.contorno.renderOrder = 40;
      this.contorno.visible = false;
      this.alvoDoGizmo.add(this.contorno);
      this.aplicarEncaixe();
      window.addEventListener('keydown', this.aoTeclar);
      window.addEventListener('keyup', this.aoSoltarTecla);

      this.observador = new ResizeObserver(() => this.redimensionar());
      this.observador.observe(el);
      this.redimensionar();

      renderizador.setAnimationLoop(agora => this.quadro(agora));
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
    window.removeEventListener('keydown', this.aoTeclar);
    window.removeEventListener('keyup', this.aoSoltarTecla);
    this.gizmo?.detach();
    this.gizmo?.dispose();
    this.controles?.dispose();
    this.cenario?.traverse(o => this.liberar(o));
    this.texturas.forEach(t => t.dispose());
    this.texturas.clear();
    this.camadas.forEach(c => c.textura.dispose());
    this.camadas.clear();
    for (const p of this.prototipos.values()) void p.then(proto => proto && this.descartarPrototipo(proto));
    this.prototipos.clear();
    this.renderizador.dispose();
    this.renderizador.forceContextLoss();
    this.renderizador.domElement.remove();
  }

  private liberar(o: Object3D): void {
    if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose(); // as matrizes das instâncias
    if (o.userData['compartilhado']) return; // pedaço de um .glb: a geometria e o material são do protótipo
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
    this.redesenhar();
  }

  /** Pede um quadro novo; com `sombras`, refaz também as sombras (algo que as projeta mudou ou se moveu). */
  private redesenhar(sombras = false): void {
    this.sujo = true;
    if (sombras) this.sombrasSujas = true;
  }

  private quadro(agora: number): void {
    this.conferirCursor();
    if (this.controles.update()) this.sujo = true; // o amortecimento ainda leva a câmera depois de soltar o mouse
    const animando = this.algumTurno || this.pingsVistos.size > 0;
    const interativo = this.sujo;
    // parado, não desenha nada; só com animação (pulso do turno, pings), desenha a 30 fps
    if (!interativo && (!animando || agora - this.ultimoDesenho < QUADRO_DE_ANIMACAO_MS)) {
      if (!animando) this.quadroAnterior = 0;
      return;
    }

    const alvo = this.camera.position;
    const pulso = 1 + Math.sin(agora * 0.0024) * 0.06;
    for (const v of this.vistas.values()) {
      // o cartão em pé encara a câmera (só gira no eixo vertical); o abatido fica deitado
      if (v.cartao.userData['deitado']) continue;
      v.cartao.rotation.y = Math.atan2(alvo.x - v.grupo.position.x, alvo.z - v.grupo.position.z);
      v.vidaFundo.rotation.y = v.vidaBarra.rotation.y = v.cartao.rotation.y;
      if (v.turno.visible) v.turno.scale.set(v.tamanho * pulso, 1, v.tamanho * pulso);
    }
    // o ping: dois anéis que crescem e somem, um atrás do outro, como no 2D
    for (const p of this.pingsVistos.values()) {
      p.aneis.forEach((anel, i) => {
        const t = (((agora - p.inicio) / CICLO_DO_PING_MS) + i * 0.32) % 1;
        anel.scale.setScalar(0.25 + t * 1.75);
        (anel.material as MeshBasicMaterial).opacity = 1 - t;
      });
    }
    if (this.sombrasSujas) {
      this.renderizador.shadowMap.needsUpdate = true;
      this.sombrasSujas = false;
    }
    this.sujo = false;
    this.ultimoDesenho = agora;
    this.renderizador.render(this.cenario, this.camera);
    if (interativo) this.medirQuadro(agora);
    else this.quadroAnterior = 0; // os quadros de animação são espaçados de propósito: não contam
  }

  /** Com a câmera andando, mede o tempo entre quadros; lento demais, baixa a resolução (um degrau por vez, sem voltar). */
  private medirQuadro(agora: number): void {
    const intervalo = agora - this.quadroAnterior;
    this.quadroAnterior = agora;
    if (intervalo <= 0 || intervalo > 100 || this.razaoDePixels <= 1) return; // pausa longa: o desenho tinha parado
    this.somaDosQuadros += intervalo;
    if (++this.quadrosMedidos < 30) return;
    const media = this.somaDosQuadros / this.quadrosMedidos;
    this.somaDosQuadros = this.quadrosMedidos = 0;
    if (media <= QUADRO_LENTO_MS) return;
    this.razaoDePixels = Math.max(1, this.razaoDePixels - 0.25);
    this.renderizador.setPixelRatio(this.razaoDePixels);
    this.redesenhar();
  }

  private conferirCursor(): void {
    const evento = this.ponteiroParado;
    if (!evento) return;
    this.ponteiroParado = null;
    const dom = this.renderizador.domElement;
    const cursor = this.tokenSob(evento) ? 'pointer' : '';
    if (dom.style.cursor !== cursor) dom.style.cursor = cursor;
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
    this.redesenhar();
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
          this.redesenhar();
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
    this.limparGrupo(this.paredesGrupo);
    this.paredesVistas.length = 0;
    this.paredesInstancias = [];

    const mestre = this.ehMestre();
    const pedra = 0, madeira = 1, vidro = 2;
    const materiais = [
      new T.MeshStandardMaterial({ color: this.corDoTema('color-mix(in srgb, var(--accent) 38%, #6b625a)'), roughness: 0.9 }),
      new T.MeshStandardMaterial({ color: this.corDoTema('color-mix(in srgb, var(--hi) 55%, #3a2412)'), roughness: 0.7 }),
      new T.MeshStandardMaterial({ color: this.corDoTema('var(--muted)'), roughness: 0.2, transparent: true, opacity: 0.28 }),
    ];
    // Todas as caixas de um material saem numa chamada de desenho só (eram centenas de malhas para os jogadores,
    // com a parede quebrada em trechos, e cada uma pesava de novo em cada passada de sombra).
    const matrizes: Matrix4[][] = [[], [], []];
    const eixoY = new T.Vector3(0, 1, 0);

    // No 3D a parede é sólida para todos (no 2D dos jogadores ela já vem pintada na imagem do mapa): sem ela, a luz das
    // tochas e da visão atravessava os cômodos. Para os jogadores, a parede é quebrada em trechos de um quadrado e cada
    // trecho segue a névoa dos dois lados, para não entregar a planta do que ainda está escondido.
    const pecas = paredes.flatMap(p => (!mestre && !p.porta && !p.janela ? dividirEmTrechos(p).map(t => ({ ...p, ...t })) : [p]));

    for (const p of pecas) {
      const dx = p.x2 - p.x1, dz = p.y2 - p.y1;
      const comprimento = Math.hypot(dx, dz);
      if (comprimento === 0) continue;
      const angulo = Math.atan2(dz, dx);
      const giro = new T.Matrix4().makeRotationY(-angulo).setPosition((p.x1 + p.x2) / 2, 0, (p.y1 + p.y2) / 2);
      const caixas: [number, number][] = [];

      // uma caixa de 1 x 1 x 1 esticada até (l, a, e), no sistema da peça girada
      const caixa = (l: number, a: number, e: number, material: number, x = 0, y = 0, z = 0, giroY = 0): void => {
        const local = new T.Matrix4().compose(
          new T.Vector3(x, y + a / 2, z), new T.Quaternion().setFromAxisAngle(eixoY, giroY), new T.Vector3(l, a, e));
        matrizes[material].push(giro.clone().multiply(local));
        caixas.push([material, matrizes[material].length - 1]);
      };

      if (p.porta) {
        if (p.aberta) {
          // batentes e a folha aberta, presa na extremidade inicial
          caixa(0.14, ALTURA_PORTA, 0.16, madeira, -comprimento / 2);
          caixa(0.14, ALTURA_PORTA, 0.16, madeira, comprimento / 2);
          caixa(comprimento * 0.92, ALTURA_PORTA * 0.95, 0.08, madeira, -comprimento / 2, 0, comprimento * 0.46, Math.PI / 2);
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
      this.paredesVistas.push({ caixas, amostras: amostrasDosLados(p), escondivel: !mestre, visivel: true });
    }

    const cubo = new T.BoxGeometry(1, 1, 1);
    this.paredesInstancias = materiais.map((material, i) => {
      if (!matrizes[i].length) { material.dispose(); return null; }
      const malha = new T.InstancedMesh(cubo, material, matrizes[i].length);
      matrizes[i].forEach((m, j) => malha.setMatrixAt(j, m));
      malha.castShadow = true;
      malha.receiveShadow = true;
      malha.computeBoundingSphere(); // com tudo à mostra: esconder um trecho não precisa recalcular
      this.paredesGrupo.add(malha);
      return { malha, matrizes: matrizes[i] };
    });
    if (!this.paredesInstancias.some(Boolean)) cubo.dispose();
    this.esconderSobNevoa(cena);
  }

  /** Esconde (escala zero) ou mostra as caixas de uma peça de parede. Diz se mudou. */
  private mostrarParede(v: VistaDaParede, visivel: boolean): boolean {
    if (v.visivel === visivel) return false;
    v.visivel = visivel;
    for (const [material, indice] of v.caixas) {
      const inst = this.paredesInstancias[material];
      if (!inst) continue;
      inst.malha.setMatrixAt(indice, visivel ? inst.matrizes[indice] : this.matrizZero);
      inst.malha.instanceMatrix.needsUpdate = true;
    }
    return true;
  }

  private matrizZeroGuardada: Matrix4 | null = null;
  private get matrizZero(): Matrix4 {
    return (this.matrizZeroGuardada ??= new this.T.Matrix4().makeScale(0, 0, 0));
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
    const mestre = this.ehMestre();
    let revelado: ((x: number, y: number) => boolean) | null = null;
    // o Mestre vê tudo: nem precisa ler a névoa
    if (!mestre && canvas && canvas.width > 0 && canvas.height > 0) {
      // A canvas da névoa tem o tamanho do mapa (milhões de pixels); ler ela inteira a cada mudança travava. Copia
      // reduzida (sem suavizar, cada pixel pega o ponto mais próximo) e lê só a cópia, com alguns pixels por quadrado.
      const w = Math.max(1, Math.ceil(this.largura(cena) * PIXELS_POR_QUADRADO_NA_NEVOA));
      const h = Math.max(1, Math.ceil(this.altura(cena) * PIXELS_POR_QUADRADO_NA_NEVOA));
      const tela = this.telaDaNevoa ?? (this.telaDaNevoa = document.createElement('canvas'));
      if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
      const c = tela.getContext('2d', { willReadFrequently: true })!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, w, h);
      c.drawImage(canvas, 0, 0, w, h);
      const dados = c.getImageData(0, 0, w, h).data;
      revelado = (x, y) => {
        const px = Math.min(w - 1, Math.max(0, Math.floor(x * PIXELS_POR_QUADRADO_NA_NEVOA)));
        const py = Math.min(h - 1, Math.max(0, Math.floor(y * PIXELS_POR_QUADRADO_NA_NEVOA)));
        return dados[(py * w + px) * 4 + 3] < 200;
      };
    }
    let mudou = false;
    for (const v of this.paredesVistas) {
      if (this.mostrarParede(v, !v.escondivel || !revelado || algumLadoRevelado(v.amostras, revelado))) mudou = true;
    }
    for (const v of this.objetosVistos.values()) {
      const visivel = mestre || !revelado || algumLadoRevelado(v.amostras, revelado);
      if (v.visivel !== visivel) { v.visivel = visivel; mudou = true; }
      v.grupo.visible = visivel;
    }
    if (mudou) {
      this.montarLotes();
      this.redesenhar(true);
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

      // o tamanho do token pode mudar a qualquer hora: base, cartão e anéis acompanham
      v.base.scale.set(lado, 1, lado);
      v.cartao.scale.set(lado, lado, 1);
      v.selecao.scale.set(lado, 1, lado);
      v.turno.scale.set(lado, 1, lado);
      v.vidaFundo.scale.x = lado;

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

      // com miniatura 3D, ela toma o lugar do cartão em pé
      v.abatido = abatido;
      v.tamanho = lado;
      const miniId = t.miniaturaId ?? null;
      if (v.miniId !== miniId) this.trocarMini(v, t.tokenId, miniId);
      v.miniEscala = miniId === null ? 'Auto' : this.escalaDe()(miniId);
      // a miniatura toma o lugar do cartão e da base colorida (a base segue invisível só para o clique achar o token)
      v.cartao.visible = !v.mini;
      v.base.visible = !v.mini;
      if (!(this.arrastandoGizmo && this.editandoToken === t.tokenId)) v.rotacao = t.rotacao ?? 0;
      this.ajustarMini(v);

      v.selecao.visible = selecionado === t.tokenId;
      v.turno.visible = !!info?.turno && !abatido;

      const comVida = !!info?.vida && !abatido;
      v.vidaFundo.visible = v.vidaBarra.visible = comVida;
      if (comVida && info?.vida) {
        const pct = Math.max(0.02, info.vida.pct / 100);
        const larguraBarra = lado * 0.8;
        const topo = 0.1 + Math.max(lado * 1.1, v.miniAltura) + 0.14;
        v.vidaFundo.position.set(0, topo, 0);
        v.vidaBarra.position.set(-(larguraBarra * (1 - pct)) / 2, topo, 0.001);
        v.vidaBarra.scale.set(pct * lado, 1, 1);
        (v.vidaBarra.material as MeshBasicMaterial).color.set(this.corDoTema(info.vida.pct <= 25 ? 'var(--danger)' : 'var(--ok)'));
      }

      this.atualizarLuz(v, t);
    }
    this.algumTurno = [...this.vistas.values()].some(v => v.turno.visible);
    this.atualizarGizmo(); // o token selecionado pode ter andado, ganhado miniatura ou caído
  }

  // ---------- modelos 3D: peças de cenário e miniaturas (WYV-25/26) ----------

  /** O .glb lido uma vez por mapa aberto; cada uso é um clone que divide geometria e material com ele. */
  private prototipo(modeloId: number): Promise<Prototipo | null> {
    let pedido = this.prototipos.get(modeloId);
    if (!pedido) {
      pedido = this.carregarPrototipo(modeloId);
      this.prototipos.set(modeloId, pedido);
    }
    return pedido;
  }

  private async carregarPrototipo(modeloId: number): Promise<Prototipo | null> {
    const buscar = this.arquivoDoModelo();
    if (!buscar) return null;
    try {
      // o leitor de glTF só é baixado quando a mesa usa o primeiro modelo
      const [leitor, { clone }, bytes] = await Promise.all([
        criarLeitorGltf(),
        import('three/addons/utils/SkeletonUtils.js'),
        buscar(modeloId),
      ]);
      if (this.destruido) return null;
      this.clonar ??= clone;
      const gltf = await leitor.parseAsync(bytes, '');
      const T = this.T;
      const modelo = gltf.scene;
      const caixa = new T.Box3().setFromObject(modelo);
      if (caixa.isEmpty()) return null;
      const medidas = caixa.getSize(new T.Vector3());
      const centro = caixa.getCenter(new T.Vector3());
      // o pé do modelo no chão e o meio dele no centro do quadrado
      modelo.position.set(-centro.x, -caixa.min.y, -centro.z);
      const raiz = new T.Group();
      raiz.add(modelo);
      raiz.updateMatrixWorld(true);
      const partes: ParteDoModelo[] = [];
      let instanciavel = true;
      raiz.traverse(o => {
        o.userData['compartilhado'] = true;
        const m = o as Mesh;
        const marcas = o as { isSkinnedMesh?: boolean; isLine?: boolean; isPoints?: boolean };
        if (marcas.isSkinnedMesh || marcas.isLine || marcas.isPoints) instanciavel = false;
        else if (m.isMesh) partes.push({ geometria: m.geometry, material: m.material, matriz: m.matrixWorld.clone() });
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      return {
        raiz,
        largura: Math.max(medidas.x, 1e-3),
        profundidade: Math.max(medidas.z, 1e-3),
        altura: Math.max(medidas.y, 1e-3),
        partes: instanciavel && partes.length > 0 ? partes : null,
      };
    } catch (erro) {
      console.error('Não foi possível abrir o modelo 3D', modeloId, erro);
      if (!this.destruido) this.modeloFalhou.emit(modeloId);
      return null;
    }
  }

  private instanciar(p: Prototipo): Object3D {
    return (this.clonar ?? ((o: Object3D) => o.clone(true)))(p.raiz);
  }

  /** Libera geometrias, materiais e texturas de um protótipo (só quando o 3D fecha: os clones usam os mesmos). */
  private descartarPrototipo(p: Prototipo): void {
    p.raiz.traverse(o => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const materiais = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as Material[];
      for (const material of materiais) {
        for (const valor of Object.values(material)) if (valor && typeof valor === 'object' && 'isTexture' in valor) (valor as { dispose(): void }).dispose();
        material.dispose();
      }
    });
  }

  private sincronizarObjetos(objetos: ObjetoCena[]): void {
    const vivos = new Set(objetos.map(o => o.objetoId));
    for (const [id, v] of this.objetosVistos) {
      if (vivos.has(id)) continue;
      this.objetosGrupo.remove(v.grupo);
      this.objetosVistos.delete(id);
    }

    for (const o of objetos) {
      let v = this.objetosVistos.get(o.objetoId);
      if (v && v.modeloId !== o.modeloId) {
        this.objetosGrupo.remove(v.grupo);
        v = undefined;
      }
      if (!v) {
        const nova: VistaDoObjeto = {
          objetoId: o.objetoId, grupo: new this.T.Group(), modeloId: o.modeloId, instancia: null, prototipo: null, dados: { ...o },
          amostras: [], matriz: new this.T.Matrix4(), visivel: true,
        };
        nova.grupo.userData['objetoId'] = o.objetoId;
        nova.grupo.rotation.order = 'YXZ'; // primeiro o giro em volta do eixo vertical, depois a inclinação
        this.objetosVistos.set(o.objetoId, nova);
        this.objetosGrupo.add(nova.grupo);
        void this.prototipo(o.modeloId).then(p => {
          if (!p || this.objetosVistos.get(o.objetoId) !== nova) return;
          nova.prototipo = p;
          // com as malhas à mão, a peça entra no lote do modelo; com esqueleto, vira um clone
          if (!p.partes) {
            nova.instancia = this.instanciar(p);
            nova.grupo.add(nova.instancia);
          }
          this.escalarObjeto(nova);
          this.montarLotes();
          this.atualizarGizmo();
          this.redesenhar(true);
        });
        v = nova;
      }
      // a peça no gizmo é de quem está mexendo nela: a versão que volta do servidor não a puxa de volta no meio
      if (!(this.arrastandoGizmo && this.editando === o.objetoId)) v.dados = { ...o };
      this.escalarObjeto(v);
    }
    this.esconderSobNevoa(this.cena());
    this.montarLotes();
    this.atualizarGizmo();
  }

  /**
   * Põe a peça no lugar: posição, giro (vertical, depois a inclinação) e escala por eixo. Escala 1 = o lado maior do
   * modelo, visto de cima, ocupa (quase) um quadrado.
   */
  private escalarObjeto(v: VistaDoObjeto): void {
    const d = v.dados;
    v.grupo.position.set(d.x, d.y, d.z);
    v.grupo.rotation.set(graus(d.giroX), -graus(d.rotacao), graus(d.giroZ));
    v.grupo.updateMatrix();
    v.amostras = [[d.x, d.z]];
    if (!v.prototipo) return;
    const n = 0.96 / Math.max(v.prototipo.largura, v.prototipo.profundidade);
    const escala = new this.T.Vector3(d.escalaX * n, d.escalaY * n, d.escalaZ * n);
    v.instancia?.scale.copy(escala);
    v.matriz.copy(v.grupo.matrix).scale(escala);
  }

  /**
   * Refaz os lotes: para cada modelo instanciável, uma InstancedMesh por malha dele com todas as peças visíveis.
   * Cresce em potências de dois para não recriar a cada peça nova.
   */
  private montarLotes(): void {
    const T = this.T;
    const porModelo = new Map<number, VistaDoObjeto[]>();
    for (const v of this.objetosVistos.values()) {
      if (!v.visivel || !v.prototipo?.partes) continue;
      const lista = porModelo.get(v.modeloId);
      if (lista) lista.push(v);
      else porModelo.set(v.modeloId, [v]);
    }
    for (const [id, lote] of this.lotes) {
      if (porModelo.has(id)) continue;
      this.descartarLote(lote);
      this.lotes.delete(id);
    }
    const matriz = new T.Matrix4();
    for (const [id, vistas] of porModelo) {
      const partes = vistas[0].prototipo!.partes!;
      let lote = this.lotes.get(id);
      if (!lote || lote.capacidade < vistas.length) {
        if (lote) this.descartarLote(lote);
        const capacidade = Math.max(4, 2 ** Math.ceil(Math.log2(vistas.length)));
        lote = {
          capacidade,
          malhas: partes.map(parte => {
            const malha = new T.InstancedMesh(parte.geometria, parte.material, capacidade);
            malha.castShadow = true;
            malha.receiveShadow = true;
            malha.userData['compartilhado'] = true; // geometria e material são do protótipo
            this.objetosGrupo.add(malha);
            return malha;
          }),
        };
        this.lotes.set(id, lote);
      }
      lote.malhas.forEach((malha, i) => {
        malha.userData['objetos'] = vistas.map(v => v.objetoId); // instância j = peça j (para o clique achar a peça)
        vistas.forEach((v, j) => malha.setMatrixAt(j, matriz.multiplyMatrices(v.matriz, partes[i].matriz)));
        malha.count = vistas.length;
        malha.instanceMatrix.needsUpdate = true;
        malha.computeBoundingSphere();
      });
    }
  }

  private descartarLote(lote: LoteDeObjetos): void {
    for (const malha of lote.malhas) {
      this.objetosGrupo.remove(malha);
      malha.dispose();
    }
  }

  // ---------- editor de cenário: selecionar, mover, girar e escalar como numa engine ----------

  /**
   * Prende no gizmo a peça selecionada (editor de cenário) ou, sem peça, o token selecionado com miniatura que o usuário
   * pode mover (só o anel horizontal, para virar a miniatura). Sem nada disso, solta.
   */
  private atualizarGizmo(): void {
    const gizmo = this.gizmo;
    if (!gizmo || this.arrastandoGizmo) return; // no meio de um arrasto, o gizmo fica com quem está nele
    const id = this.editarCenario() ? this.objetoSelecionadoId() : null;
    const v = id === null ? undefined : this.objetosVistos.get(id);
    if (!v?.prototipo) {
      if (this.prenderToken()) return;
      if (this.editando !== null || this.editandoToken !== null) {
        gizmo.detach();
        this.editando = this.editandoToken = null;
        this.contorno.visible = false;
        this.redesenhar();
      }
      return;
    }
    if (this.editandoToken !== null) { gizmo.detach(); this.editandoToken = null; }
    this.aplicarModo();
    const d = v.dados, alvo = this.alvoDoGizmo, p = v.prototipo;
    alvo.position.set(d.x, d.y, d.z);
    alvo.rotation.set(graus(d.giroX), -graus(d.rotacao), graus(d.giroZ));
    alvo.scale.set(d.escalaX, d.escalaY, d.escalaZ);
    // a caixa tem as medidas da peça com escala 1; o alvo a estica junto com a peça
    const n = 0.96 / Math.max(p.largura, p.profundidade);
    this.contorno.scale.set(p.largura * n, p.altura * n, p.profundidade * n);
    this.contorno.position.set(0, (p.altura * n) / 2, 0);
    this.contorno.visible = true;
    if (this.editando !== id) gizmo.attach(alvo);
    this.editando = id;
    this.redesenhar();
  }

  /** O token selecionado, com miniatura e que o usuário pode mover, ganha o anel que a vira. Diz se prendeu. */
  private prenderToken(): boolean {
    const gizmo = this.gizmo!;
    const id = this.selecionadoId();
    const vista = id === null ? undefined : this.vistas.get(id);
    const token = id === null ? undefined : this.tokens().find(t => t.tokenId === id);
    if (!vista?.mini || !token || !this.podeMover()(token) || vista.abatido) return false;
    if (this.editando !== null) { gizmo.detach(); this.editando = null; }
    gizmo.setMode('rotate');
    gizmo.setSpace('world');
    gizmo.showX = false;
    gizmo.showZ = false;
    const alvo = this.alvoDoGizmo;
    alvo.position.copy(vista.grupo.position);
    alvo.rotation.set(0, -graus(vista.rotacao), 0);
    alvo.scale.set(1, 1, 1);
    this.contorno.visible = false;
    if (this.editandoToken !== id) gizmo.attach(alvo);
    this.editandoToken = id;
    this.redesenhar();
    return true;
  }

  /** O modo escolhido (W/E/R) com os três eixos: o que vale para as peças de cenário. */
  private aplicarModo(): void {
    const gizmo = this.gizmo;
    if (!gizmo) return;
    const modo = this.modoDoGizmo();
    gizmo.showX = gizmo.showZ = true;
    gizmo.setMode(modo);
    // mover e girar em volta dos eixos do mundo (o anel horizontal gira em volta da vertical); escala, nos da peça
    gizmo.setSpace(modo === 'scale' ? 'local' : 'world');
  }

  /** O gizmo mexeu no alvo: a peça (ou a miniatura) acompanha na hora; só grava ao soltar. */
  private aoMexerNoGizmo(): void {
    if (this.editandoToken !== null) {
      const vista = this.vistas.get(this.editandoToken);
      if (!vista) return;
      vista.rotacao = ((-emGraus(this.alvoDoGizmo.rotation.y) % 360) + 360) % 360;
      this.ajustarMini(vista);
      this.redesenhar(true);
      return;
    }
    const v = this.editando === null ? undefined : this.objetosVistos.get(this.editando);
    if (!v) return;
    const alvo = this.alvoDoGizmo;
    const minima = 0.1;
    alvo.scale.set(Math.max(minima, alvo.scale.x), Math.max(minima, alvo.scale.y), Math.max(minima, alvo.scale.z));
    const r = alvo.rotation; // ordem YXZ: y é o giro em volta da vertical, x e z a inclinação
    v.dados = {
      x: alvo.position.x, y: alvo.position.y, z: alvo.position.z,
      escalaX: alvo.scale.x, escalaY: alvo.scale.y, escalaZ: alvo.scale.z,
      rotacao: ((-emGraus(r.y) % 360) + 360) % 360, giroX: emGraus(r.x), giroZ: emGraus(r.z),
    };
    this.escalarObjeto(v);
    this.montarLotes();
    this.redesenhar(true);
  }

  private soltarGizmo(): void {
    if (this.editandoToken !== null) {
      const vista = this.vistas.get(this.editandoToken);
      if (vista) this.girarToken.emit({ tokenId: this.editandoToken, rotacao: vista.rotacao });
      return;
    }
    const v = this.editando === null ? undefined : this.objetosVistos.get(this.editando);
    if (v) this.transformarObjeto.emit({ objetoId: v.objetoId, ...v.dados });
  }

  /** Encaixe ligado, sem Ctrl segurado: meio quadrado, 15° e 0,25 de escala. */
  private aplicarEncaixe(): void {
    const g = this.gizmo;
    if (!g) return;
    const livre = !this.encaixe() || this.ctrlApertado;
    g.setTranslationSnap(livre ? null : ENCAIXE_POSICAO);
    g.setRotationSnap(livre ? null : graus(ENCAIXE_GIRO));
    g.setScaleSnap(livre ? null : ENCAIXE_ESCALA);
  }

  /** Atalhos do editor, como nas engines: W move, E gira, R escala, Del apaga, Ctrl+D duplica, Esc solta a seleção. */
  private teclaDoEditor(e: KeyboardEvent): void {
    if (!this.editarCenario()) return;
    if (e.key === 'Control' && !this.ctrlApertado) { this.ctrlApertado = true; this.aplicarEncaixe(); return; }
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return; // digitando em outro lugar
    const id = this.objetoSelecionadoId();
    const tecla = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && tecla === 'd') {
      if (id === null) return;
      e.preventDefault(); // no navegador, Ctrl+D marca a página
      this.duplicarObjeto.emit(id);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (tecla === 'w') this.modoDoGizmo.set('translate');
    else if (tecla === 'e') this.modoDoGizmo.set('rotate');
    else if (tecla === 'r') this.modoDoGizmo.set('scale');
    else if ((tecla === 'delete' || tecla === 'backspace') && id !== null && !this.arrastandoGizmo) this.apagarObjeto.emit(id);
    else if (tecla === 'escape' && id !== null) this.selecionarObjeto.emit(null);
  }

  /** A peça de cenário sob o ponteiro (a mais perto da câmera), e o ponto da superfície dela onde o raio bateu. */
  private objetoSob(evento: MouseEvent): { objetoId: number; ponto: { x: number; y: number; z: number } } | null {
    const alvos: Object3D[] = [];
    for (const lote of this.lotes.values()) alvos.push(...lote.malhas);
    for (const v of this.objetosVistos.values()) if (v.instancia && v.grupo.visible) alvos.push(v.grupo);
    for (const a of this.raio(evento).intersectObjects(alvos, true)) {
      let id: number | undefined;
      const lista = a.object.userData['objetos'] as number[] | undefined;
      if (lista && a.instanceId !== undefined) id = lista[a.instanceId];
      for (let o: Object3D | null = a.object; id === undefined && o; o = o.parent) id = o.userData['objetoId'] as number | undefined;
      if (id !== undefined) return { objetoId: id, ponto: { x: a.point.x, y: a.point.y, z: a.point.z } };
    }
    return null;
  }

  /** Onde a peça nova vai: em cima da peça clicada, ou no chão (com o encaixe, no meio quadrado mais perto). */
  private pontoDeApoio(evento: MouseEvent): { x: number; y: number; z: number } | null {
    const sobre = this.objetoSob(evento);
    const p = sobre?.ponto ?? (() => { const c = this.pontoNoMapa(evento); return c && { x: c.x, y: 0, z: c.z }; })();
    if (!p) return null;
    if (this.encaixe() && !this.ctrlApertado) {
      p.x = Math.round(p.x / ENCAIXE_POSICAO) * ENCAIXE_POSICAO;
      p.z = Math.round(p.z / ENCAIXE_POSICAO) * ENCAIXE_POSICAO;
    }
    return p;
  }

  private trocarMini(v: VistaDoToken, tokenId: number, miniId: number | null): void {
    if (v.mini) v.grupo.remove(v.mini);
    v.mini = null;
    v.miniAltura = 0;
    v.miniPrototipo = null;
    v.miniId = miniId;
    if (miniId === null) return;
    void this.prototipo(miniId).then(p => {
      if (!p || v.miniId !== miniId || this.vistas.get(tokenId) !== v) return;
      const mini = this.instanciar(p);
      mini.traverse(o => (o.userData['tokenId'] = tokenId));
      v.mini = mini;
      v.miniPrototipo = p;
      v.grupo.add(mini);
      v.cartao.visible = false;
      v.base.visible = false;
      this.ajustarMini(v);
      this.atualizarGizmo();
      this.redesenhar(true);
    });
  }

  /**
   * A miniatura fica em pé sobre a base e sempre acompanha o tamanho do token. Pelas medidas (miniatura impressa, 25,4 mm
   * = 1 quadrado, ou tamanho real), ela tem o tamanho dela no D&D: num token desse tamanho fica exatamente assim, e num
   * token maior ou menor cresce ou encolhe na mesma proporção. Encaixada, fica da altura do cartão sem passar da base.
   * Abatida, deita no chão.
   */
  private ajustarMini(v: VistaDoToken): void {
    const mini = v.mini, p = v.miniPrototipo;
    if (!mini || !p) return;
    const lado = v.tamanho;
    const largura = Math.max(p.largura, p.profundidade);
    const fator = quadradosPorUnidade(v.miniEscala, p.altura);
    const escala = fator === null
      ? Math.min((1.1 * lado) / p.altura, (0.9 * lado) / largura)
      : (fator * lado) / tamanhoDnd(largura * fator).lado;
    v.miniAltura = v.abatido ? 0 : p.altura * escala;
    mini.scale.setScalar(escala);
    // com miniatura não há base: ela fica direto no chão, virada para onde o token olha
    const giro = -graus(v.rotacao);
    mini.rotation.order = 'YXZ';
    if (v.abatido) {
      // deitada de costas, com os pés no centro do token e a cabeça para onde ele olhava
      const meio = (p.altura * escala) / 2;
      mini.rotation.set(-Math.PI / 2, giro, 0);
      mini.position.set(meio * Math.sin(giro), (p.profundidade * escala) / 2, meio * Math.cos(giro));
    } else {
      mini.rotation.set(0, giro, 0);
      mini.position.set(0, 0, 0);
    }
  }

  /** As peças do token nascem com 1 quadrado de lado; `sincronizarTokens` estica cada uma até o tamanho atual dele. */
  private criarVista(t: TokenCena): VistaDoToken {
    const T = this.T;
    const lado = 1;
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

    return {
      grupo, cartao, base, selecao, turno, vidaFundo, vidaBarra, luz: null, chave: '', tamanho: t.tamanho, textura: null,
      mini: null, miniId: null, miniPrototipo: null, miniEscala: 'Auto', miniAltura: 0, abatido: false, rotacao: t.rotacao ?? 0,
    };
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
      const aplicar = (img: HTMLImageElement): void => { pintar(img); textura.needsUpdate = true; this.redesenhar(); };
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
    for (const v of this.vistas.values()) {
      alvos.push(v.cartao, v.base);
      if (v.mini) alvos.push(v.mini);
    }
    const acertos = this.raio(evento).intersectObjects(alvos, true);
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
    if (this.gizmo?.axis) return; // o ponteiro está numa seta, anel ou alça do gizmo: ele cuida
    if (this.editarCenario() && this.ferramenta() === 'objeto') {
      // pôr peça: soltar sem arrastar põe a peça (em `aoSoltar`); arrastar continua levando a câmera
      this.comecarToque(evento, false);
      return;
    }
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
    if (!sob) {
      // no editor, clicar numa peça de cenário a seleciona (os tokens, por estarem em cima, vêm antes)
      const peca = this.editarCenario() ? this.objetoSob(evento) : null;
      if (peca) { this.selecionarObjeto.emit(peca.objetoId); return; }
      this.comecarToque(evento);
      return;
    }
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
  private comecarToque(evento: PointerEvent, comPing = true): void {
    this.cancelarToque();
    const toque: ToqueNoChao = { ponteiro: evento.pointerId, x: evento.clientX, y: evento.clientY, moveu: false, pingou: false };
    if (comPing) toque.timer = setTimeout(() => {
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
      // arrastando a câmera, nada de procurar token sob o ponteiro; parado, procura uma vez por quadro (em `quadro`)
      if (evento.buttons === 0) this.ponteiroParado = evento;
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
    this.redesenhar(true); // a base e a luz do token andam junto
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
        if (this.editarCenario() && this.ferramenta() === 'objeto') {
          const p = this.pontoDeApoio(evento);
          if (p) this.porObjeto.emit(p);
        } else {
          if (this.editarCenario() && this.objetoSelecionadoId() !== null) this.selecionarObjeto.emit(null); // clique no vazio solta
          const p = this.pontoNoMapa(evento);
          if (p) this.toque.emit(p);
        }
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
    this.redesenhar(true);
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
    // cada leitura força o navegador a recalcular estilos: guarda as cores só até o fim da tarefa atual, o que junta
    // as muitas chamadas de uma sincronização sem deixar de ver uma troca de tema depois
    const guardada = this.coresDoTema.get(expressao);
    if (guardada !== undefined) return guardada;
    if (this.coresDoTema.size === 0) queueMicrotask(() => this.coresDoTema.clear());
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
    const cor = (r << 16) | (g << 8) | b;
    this.coresDoTema.set(expressao, cor);
    return cor;
  }

  private canvasDeCor: HTMLCanvasElement | null = null;
  private readonly coresDoTema = new Map<string, number>();
}

