import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CampaignService } from '../../services/campaign';
import { PapelService } from '../../services/papel.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { VisualizadorGlb } from '../../../shared/ui/visualizador-glb/visualizador-glb';
import { BibliotecaDeModelos, CategoriaModelo, Modelo3d } from '../../../sessoes/models/cena';
import { Modelos3dService, TAMANHO_MAXIMO_GLB, formatarTamanho, pareceGlb } from '../../../sessoes/services/modelos3d.service';
import { converterStlParaGlb, ehStl, limiteDoStl } from '../../../sessoes/utils/stl-para-glb';
import { ArquivosDoGltfFaltando, converterGltfParaGlb, ehGltf } from '../../../sessoes/utils/gltf-para-glb';
import { converter3mfParaGlb, eh3mf, limiteDo3mf } from '../../../sessoes/utils/modelo-3mf-para-glb';
import { META_DE_TRIANGULOS, TexturasPerdidas, otimizarGlb } from '../../../sessoes/utils/otimizar-glb';

/** Acima disso, um modelo já na biblioteca ganha o botão "Otimizar" (50 mil triângulos dão uns 1 a 2 MB). */
const TAMANHO_DE_MODELO_PESADO = 4 * 1024 * 1024;

const milhares = (n: number): string => n.toLocaleString('pt-BR');
import { ESCALAS, EscalaModelo, MedidasNaMesa, medidasNaMesa } from '../../../sessoes/utils/escala-3d';

/** Nome sugerido a partir do arquivo: "goblin_arqueiro.glb" vira "Goblin arqueiro". */
export function nomeDoArquivo(arquivo: string): string {
  const base = arquivo.replace(/\.(glb|gltf|stl|3mf)$/i, '').replace(/[_-]+/g, ' ').trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 80);
}

/**
 * Biblioteca 3D da campanha (WYV-25/26): o Mestre sobe peças de cenário e miniaturas; o jogador, miniaturas para o
 * próprio herói. Todo mundo da mesa vê a lista e a prévia.
 */
@Component({
  selector: 'app-modelos-3d',
  imports: [DatePipe, FormsModule, RouterLink, VisualizadorGlb],
  templateUrl: './modelos-3d.html',
  styleUrl: './modelos-3d.scss',
})
export class Modelos3d implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private modelos = inject(Modelos3dService);
  private campanhas = inject(CampaignService);
  private papelService = inject(PapelService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private readonly meuId = inject(AuthService).usuarioLogado()?.usuarioId ?? 0;

  readonly campanhaId = Number(this.route.snapshot.paramMap.get('id'));
  /** De onde veio (o mapa da sessão): só caminhos internos, para não virar um redirecionamento para fora. */
  readonly voltar = ((v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null))(this.route.snapshot.queryParamMap.get('voltar'));
  readonly campanhaNome = signal('');
  readonly ehMestre = signal(false);
  readonly biblioteca = signal<BibliotecaDeModelos | null>(null);
  readonly carregando = signal(true);
  readonly semAcesso = signal(false);
  readonly enviando = signal(false);
  /** Convertendo um .stl para .glb no navegador (pode levar alguns segundos). */
  readonly convertendo = signal(false);
  /** Simplificando o modelo antes de subir. */
  readonly otimizando = signal(false);
  /** O modelo da biblioteca que está sendo otimizado agora (um por vez). */
  readonly otimizandoId = signal<number | null>(null);
  readonly previa = signal<Modelo3d | null>(null);
  /** Medidas do modelo em prévia, nas unidades do arquivo (vêm do visualizador). */
  readonly medidasDaPrevia = signal<{ largura: number; profundidade: number; altura: number } | null>(null);
  readonly escalas = ESCALAS;
  /** Como o modelo em prévia fica na mesa, com a escala dele. */
  readonly naMesa = computed<MedidasNaMesa | null>(() => {
    const m = this.medidasDaPrevia(), p = this.previa();
    return m && p ? medidasNaMesa(m, p.escala) : null;
  });

  readonly cenario = computed(() => this.biblioteca()?.modelos.filter(m => m.categoria === 'Cenario') ?? []);
  readonly miniaturas = computed(() => this.biblioteca()?.modelos.filter(m => m.categoria === 'Miniatura') ?? []);
  readonly grupos = computed(() => [
    {
      titulo: 'Cenário', icone: 'bi-tree', itens: this.cenario(), vazio: 'Nenhuma peça de cenário ainda.',
      uso: 'No mapa, use a ferramenta “Cenário 3D” (ícone de caixa): escolha a peça e o tamanho na barra e clique no grid.',
    },
    {
      titulo: 'Miniaturas', icone: 'bi-person-standing', itens: this.miniaturas(),
      vazio: 'Nenhuma miniatura ainda.',
      uso: 'A miniatura veste um token. No mapa: “+ Token” e escolha a “Miniatura 3D”, ou selecione um token já no grid e troque no painel. Para um personagem, escolha na ficha dele: todo token dele usa a mesma.',
    },
  ]);
  readonly usoPct = computed(() => {
    const b = this.biblioteca();
    return b ? Math.min(100, Math.round((b.espacoUsado / b.espacoTotal) * 100)) : 0;
  });

  arquivo: File | null = null;
  /** O arquivo veio de um .stl ou .3mf convertido: as medidas são de miniatura impressa. */
  private arquivoEraStl = false;
  nome = '';
  categoria: CategoriaModelo = 'Miniatura';
  readonly formatar = formatarTamanho;
  readonly metas = META_DE_TRIANGULOS;
  readonly milharesDe = milhares;

  ngOnInit(): void {
    this.campanhas.getById(this.campanhaId).subscribe({ next: c => this.campanhaNome.set(c.nome) });
    firstValueFrom(this.papelService.papelNaCampanha(this.campanhaId))
      .then(p => {
        this.ehMestre.set(p === 'Mestre');
        if (this.ehMestre()) this.categoria = 'Cenario';
      })
      .catch(() => undefined);
    void this.carregar();
  }

  async carregar(): Promise<void> {
    try {
      this.biblioteca.set(await this.modelos.biblioteca(this.campanhaId));
    } catch (err) {
      // só é "não participa" quando a API diz que a campanha não existe para você; outro 404 é rota que falta, não permissão
      const e = err as HttpErrorResponse;
      const corpo = typeof e?.error === 'string' ? e.error : (e?.error?.detail ?? e?.error?.message ?? '');
      this.semAcesso.set(e?.status === 403 || (e?.status === 404 && /campanha não encontrada/i.test(String(corpo))));
      if (!this.semAcesso()) this.toast.erro('Não foi possível carregar a biblioteca 3D. Tente de novo em instantes.');
    } finally {
      this.carregando.set(false);
    }
  }

  async escolherArquivo(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const selecionados = Array.from(campo.files ?? []);
    // um .gltf vem com o .bin e as texturas: a seleção toda vai junto para a conversão
    let arquivo = selecionados.find(a => ehGltf(a.name)) ?? selecionados[0] ?? null;
    this.arquivo = null;
    if (!arquivo) return;
    const limite = this.biblioteca()?.tamanhoMaximoArquivo ?? TAMANHO_MAXIMO_GLB;
    const eraStl = ehStl(arquivo.name);
    const deImpressao = eraStl || eh3mf(arquivo.name); // medidas de miniatura impressa
    if (ehGltf(arquivo.name)) {
      this.convertendo.set(true);
      try {
        arquivo = await converterGltfParaGlb(selecionados);
      } catch (erro) {
        console.error('Conversão de .gltf', erro);
        this.toast.erro(erro instanceof ArquivosDoGltfFaltando
          ? `Selecione junto com o .gltf os arquivos que ele usa: ${erro.nomes.join(', ')}.`
          : 'Não foi possível ler este .gltf. Confira se ele abre no Blender, ou exporte como “glTF Binary” (.glb).');
        campo.value = '';
        return;
      } finally {
        this.convertendo.set(false);
      }
    } else if (eh3mf(arquivo.name)) {
      if (arquivo.size > limiteDo3mf(limite)) {
        this.toast.erro(`Este .3mf tem ${formatarTamanho(arquivo.size)}; o limite para converter é ${formatarTamanho(limiteDo3mf(limite))}. Simplifique o modelo (no Blender, modificador “Decimate”).`);
        campo.value = '';
        return;
      }
      this.convertendo.set(true);
      try {
        arquivo = await converter3mfParaGlb(arquivo);
      } catch (erro) {
        console.error('Conversão de .3mf', erro);
        this.toast.erro('Não foi possível ler este .3mf. Confira se ele abre no fatiador, ou exporte como .stl ou .glb.');
        campo.value = '';
        return;
      } finally {
        this.convertendo.set(false);
      }
    } else if (eraStl) {
      if (arquivo.size > limiteDoStl(limite)) {
        this.toast.erro(`Este .stl tem ${formatarTamanho(arquivo.size)}; o limite para converter é ${formatarTamanho(limiteDoStl(limite))}. Simplifique o modelo (no Blender, modificador “Decimate”).`);
        campo.value = '';
        return;
      }
      this.convertendo.set(true);
      try {
        arquivo = await converterStlParaGlb(arquivo);
      } catch (erro) {
        console.error('Conversão de .stl', erro);
        this.toast.erro('Não foi possível ler este .stl. Confira se o arquivo abre no Blender ou no fatiador da impressora.');
        campo.value = '';
        return;
      } finally {
        this.convertendo.set(false);
      }
    }
    // o limite de tamanho é conferido ao subir, depois de otimizar: um .glb pesado demais costuma ficar bem abaixo dele
    if (!pareceGlb(await arquivo.slice(0, 12).arrayBuffer(), arquivo.size)) {
      this.toast.erro('Use um arquivo .glb (glTF binário). No Blender: Exportar → glTF 2.0 → formato “glTF Binary”.');
      campo.value = '';
      return;
    }
    this.arquivoEraStl = deImpressao;
    this.arquivo = arquivo;
    if (!this.nome.trim()) this.nome = nomeDoArquivo(arquivo.name);
  }

  async enviar(form: HTMLFormElement): Promise<void> {
    if (!this.arquivo || this.enviando()) return;
    const nome = this.nome.trim() || nomeDoArquivo(this.arquivo.name) || 'Modelo';
    const categoria = this.ehMestre() ? this.categoria : 'Miniatura';
    const limite = this.biblioteca()?.tamanhoMaximoArquivo ?? TAMANHO_MAXIMO_GLB;
    this.enviando.set(true);
    try {
      // a categoria só é certa agora: miniatura e cenário têm metas diferentes
      const arquivo = await this.otimizar(this.arquivo, categoria);
      if (!arquivo) return;
      if (arquivo.size > limite) {
        this.toast.erro(`O modelo ficou com ${formatarTamanho(arquivo.size)} (o limite é ${formatarTamanho(limite)}). Diminua as texturas ou simplifique no Blender (modificador “Decimate”).`);
        return;
      }
      const novo = await this.modelos.enviar(this.campanhaId, arquivo, nome, categoria, this.arquivoEraStl ? 'Impressao' : 'Auto');
      this.toast.ok(`“${novo.nome}” está na biblioteca.`);
      this.arquivo = null;
      this.nome = '';
      form.reset();
      await this.carregar();
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.toast.erro(e?.error?.message || e?.error?.detail || 'Não foi possível subir o modelo.');
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * Deixa o modelo leve para a mesa (ver otimizarGlb). Devolve o arquivo a subir (o mesmo, se já era leve) ou null se
   * a otimização falhou (o aviso já foi dado).
   */
  private async otimizar(arquivo: File, categoria: CategoriaModelo): Promise<File | null> {
    this.otimizando.set(true);
    try {
      const r = await otimizarGlb(arquivo, META_DE_TRIANGULOS[categoria]);
      if (!r) return arquivo;
      this.toast.info(`Modelo otimizado para a mesa: ${milhares(r.antes)} → ${milhares(r.depois)} triângulos (${formatarTamanho(arquivo.size)} → ${formatarTamanho(r.arquivo.size)}).`);
      return r.arquivo;
    } catch (erro) {
      console.error('Otimização do modelo', erro);
      this.toast.erro(erro instanceof TexturasPerdidas
        ? 'As texturas deste modelo não abriram, e ele ficaria sem cor. Confira se o .glb abre colorido em outro visualizador (ex.: gltf-viewer.donmccurdy.com).'
        : 'Não foi possível otimizar este modelo. Se ele usa compressão Draco ou meshopt, exporte do Blender sem compressão.');
      return null;
    } finally {
      this.otimizando.set(false);
    }
  }

  /** Um modelo já na biblioteca que provavelmente pesa na mesa (só o tamanho dá para saber sem baixar). */
  pesado(m: Modelo3d): boolean {
    return m.tamanho > TAMANHO_DE_MODELO_PESADO;
  }

  /** Otimiza um modelo que já está na biblioteca e põe a versão leve no lugar dele (mapas, tokens e fichas acompanham). */
  async otimizarExistente(m: Modelo3d): Promise<void> {
    if (this.otimizandoId() !== null) return;
    this.otimizandoId.set(m.modeloId);
    try {
      const bytes = await this.modelos.arquivo(this.campanhaId, m.modeloId);
      const r = await otimizarGlb(new File([bytes], `${m.nome}.glb`, { type: 'model/gltf-binary' }), META_DE_TRIANGULOS[m.categoria]);
      if (!r) {
        this.toast.info(`“${m.nome}” já está leve para a mesa.`);
        return;
      }
      const novo = await this.modelos.substituir(this.campanhaId, m.modeloId, r.arquivo);
      this.toast.ok(`“${m.nome}” otimizado: ${milhares(r.antes)} → ${milhares(r.depois)} triângulos (${formatarTamanho(m.tamanho)} → ${formatarTamanho(novo.tamanho)}).`);
      if (this.previa()?.modeloId === m.modeloId) this.previa.set(novo);
      await this.carregar();
    } catch (err) {
      console.error('Otimização do modelo', err);
      const e = err as HttpErrorResponse;
      this.toast.erro(err instanceof TexturasPerdidas
        ? `As texturas de “${m.nome}” não abriram; o modelo ficou como estava.`
        : e?.error?.message || e?.error?.detail || `Não foi possível otimizar “${m.nome}”.`);
    } finally {
      this.otimizandoId.set(null);
    }
  }

  podeApagar(m: Modelo3d): boolean {
    return this.ehMestre() || m.enviadoPorId === this.meuId;
  }

  async apagar(m: Modelo3d): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Apagar modelo',
      mensagem: m.categoria === 'Cenario'
        ? `“${m.nome}” sai da biblioteca e de todos os mapas em que foi posto.`
        : `“${m.nome}” sai da biblioteca. Quem usava esta miniatura volta ao token comum.`,
      confirmar: 'Apagar',
    });
    if (!ok) return;
    try {
      await this.modelos.apagar(this.campanhaId, m.modeloId);
      if (this.previa()?.modeloId === m.modeloId) this.previa.set(null);
      await this.carregar();
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.toast.erro(e?.error?.detail || e?.error?.message || 'Não foi possível apagar o modelo.');
    }
  }

  voltarAoMapa(): void {
    if (this.voltar) void this.router.navigateByUrl(this.voltar);
  }

  /** Troca a escala (ou o nome) do modelo; a mesa recebe a mudança na hora. */
  async trocarEscala(m: Modelo3d, escala: EscalaModelo): Promise<void> {
    try {
      const salvo = await this.modelos.editar(this.campanhaId, m.modeloId, m.nome, escala);
      this.biblioteca.update(b => b && { ...b, modelos: b.modelos.map(x => (x.modeloId === salvo.modeloId ? salvo : x)) });
      if (this.previa()?.modeloId === salvo.modeloId) this.previa.set(salvo);
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.toast.erro(e?.error?.message || e?.error?.detail || 'Não foi possível trocar a escala.');
    }
  }

  mm(valor: number): string {
    return valor >= 100 ? Math.round(valor) + ' mm' : valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mm';
  }

  quadrados(valor: number): string {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  /** Abre a prévia e rola até ela (ela fica acima das listas). */
  verPrevia(m: Modelo3d): void {
    this.previa.set(m);
    this.medidasDaPrevia.set(null);
    setTimeout(() => document.getElementById('tit-previa')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  readonly buscarPrevia = (): Promise<ArrayBuffer> => this.modelos.arquivo(this.campanhaId, this.previa()!.modeloId);
}
