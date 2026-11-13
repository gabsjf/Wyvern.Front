import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import type { Object3D, PerspectiveCamera, WebGLRenderer } from 'three';
import { criarLeitorGltf } from '../../../sessoes/utils/leitor-gltf';

/**
 * Mostra um .glb girando devagar, para conferir o modelo antes de usar. O Three.js só é baixado quando o
 * visualizador aparece. Arrastar gira; a roda aproxima.
 */
@Component({
  selector: 'app-visualizador-glb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #area class="area" role="img" [attr.aria-label]="'Prévia 3D: ' + nome()"></div>
    @if (estado() === 'carregando') { <p class="aviso" role="status">Carregando o modelo…</p> }
    @if (estado() === 'erro') {
      <p class="aviso erro" role="alert">Não foi possível abrir este modelo. Ele pode estar estragado ou usar compressão (Draco/Meshopt).</p>
    }
  `,
  styles: `
    :host { position: relative; display: block; aspect-ratio: 4 / 3; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-2); }
    .area { position: absolute; inset: 0; }
    .aviso { position: absolute; inset: auto 0 0; margin: 0; padding: 0.6rem 0.8rem; font-size: 0.85rem; color: var(--muted); background: color-mix(in srgb, var(--bg) 80%, transparent); }
    .aviso.erro { color: var(--danger); }
  `,
})
export class VisualizadorGlb {
  /** Busca os bytes do .glb. */
  readonly buscar = input.required<() => Promise<ArrayBuffer>>();
  readonly nome = input('');
  /** As medidas do modelo nas unidades do arquivo (para calcular o tamanho na mesa). */
  readonly medidas = output<{ largura: number; profundidade: number; altura: number }>();

  protected readonly estado = signal<'carregando' | 'pronto' | 'erro'>('carregando');
  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private renderizador: WebGLRenderer | null = null;
  private camera: PerspectiveCamera | null = null;
  private modelo: Object3D | null = null;
  private observador?: ResizeObserver;
  private destruido = false;

  constructor() {
    afterNextRender(() => void this.iniciar());
    inject(DestroyRef).onDestroy(() => this.destruir());
  }

  private async iniciar(): Promise<void> {
    try {
      const [T, leitor, { OrbitControls }, bytes] = await Promise.all([
        import('three'),
        criarLeitorGltf(),
        import('three/addons/controls/OrbitControls.js'),
        this.buscar()(),
      ]);
      if (this.destruido) return;
      const gltf = await leitor.parseAsync(bytes, '');
      if (this.destruido) return;

      const el = this.area().nativeElement;
      const renderizador = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderizador.outputColorSpace = T.SRGBColorSpace;
      el.appendChild(renderizador.domElement);
      this.renderizador = renderizador;

      const cena = new T.Scene();
      cena.add(new T.HemisphereLight(0xffffff, 0x444444, 2.2));
      const sol = new T.DirectionalLight(0xffffff, 1.6);
      sol.position.set(3, 5, 4);
      cena.add(sol);

      // centraliza e normaliza o modelo numa caixa de lado 1
      const modelo = gltf.scene;
      const caixa = new T.Box3().setFromObject(modelo);
      const medidas = caixa.getSize(new T.Vector3());
      const centro = caixa.getCenter(new T.Vector3());
      const escala = 1 / Math.max(medidas.x, medidas.y, medidas.z, 1e-3);
      this.medidas.emit({ largura: medidas.x, profundidade: medidas.z, altura: medidas.y });
      modelo.position.sub(centro);
      const pivo = new T.Group();
      pivo.add(modelo);
      pivo.scale.setScalar(escala);
      cena.add(pivo);
      this.modelo = pivo;

      const camera = new T.PerspectiveCamera(35, 1, 0.01, 100);
      camera.position.set(1.3, 0.9, 1.6);
      this.camera = camera;
      const controles = new OrbitControls(camera, renderizador.domElement);
      controles.enableDamping = true;
      controles.enablePan = false;
      controles.autoRotate = true;
      controles.autoRotateSpeed = 1.5;

      this.observador = new ResizeObserver(() => this.redimensionar());
      this.observador.observe(el);
      this.redimensionar();
      renderizador.setAnimationLoop(() => {
        controles.update();
        renderizador.render(cena, camera);
      });
      this.estado.set('pronto');
    } catch (erro) {
      console.error('Prévia 3D', erro);
      if (!this.destruido) this.estado.set('erro');
    }
  }

  private redimensionar(): void {
    if (!this.renderizador || !this.camera) return;
    const el = this.area().nativeElement;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderizador.setSize(w, h, false);
    this.renderizador.domElement.style.width = '100%';
    this.renderizador.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private destruir(): void {
    this.destruido = true;
    this.observador?.disconnect();
    this.modelo?.traverse(o => {
      const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach(x => x.dispose());
      else m.material?.dispose();
    });
    if (this.renderizador) {
      this.renderizador.setAnimationLoop(null);
      this.renderizador.dispose();
      this.renderizador.forceContextLoss();
      this.renderizador.domElement.remove();
    }
  }
}
