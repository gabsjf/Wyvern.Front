import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  ALINHAMENTOS, ANTECEDENTES, ARRANJO_PADRAO, ATRIBUTOS, AbaDaFicha, Atributo, CATEGORIAS_NPC, CLASSES, ESPECIES, Falta,
  NDS, TAMANHOS, TIPOS_DE_CRIATURA, XP_POR_ND, acharClasse, bonusDeProficienciaPorNd, bonusDeProficienciaPorNivel,
  camposObrigatorios, comSinal, faltasParaCriar, modificador, pvSugerido, temBlocoDeCombate,
  ATRIBUTOS_DE_ATAQUE, TIPOS_DE_ACAO, TIPOS_DE_DANO, bonusDeAtaque, previaDaAcao,
} from '../../utils/regras-da-ficha';
import { Modelo3d } from '../../../sessoes/models/cena';
import { Modelos3dService, TAMANHO_MAXIMO_GLB, formatarTamanho, pareceGlb } from '../../../sessoes/services/modelos3d.service';
import { converterStlParaGlb, ehStl, limiteDoStl } from '../../../sessoes/utils/stl-para-glb';
import { ArquivosDoGltfFaltando, converterGltfParaGlb, ehGltf } from '../../../sessoes/utils/gltf-para-glb';
import { converter3mfParaGlb, eh3mf, limiteDo3mf } from '../../../sessoes/utils/modelo-3mf-para-glb';
import { META_DE_TRIANGULOS, TexturasPerdidas, otimizarGlb } from '../../../sessoes/utils/otimizar-glb';
import { VisualizadorGlb } from '../../../shared/ui/visualizador-glb/visualizador-glb';

@Component({
  selector: 'app-personagem-create',
  imports: [CommonModule, FormsModule, RouterModule, VisualizadorGlb],
  templateUrl: './personagem-create.html',
  styleUrl: './personagem-create.scss',
})
export class PersonagemCreate implements OnInit {
  private personagemService = inject(PersonagemService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private modelos3d = inject(Modelos3dService);

  // Só o Mestre da campanha escolhida define o tipo (Jogador/NPC/Monstro); o servidor também impõe isso
  get ehMestreNaCampanha(): boolean {
    return this.campanhas.find(c => c.campanhaId === this.personagem.campanhaId)?.papel === 'Mestre';
  }

  /**
   * Editando um herói sem ser Mestre: o que muda ao subir de nível fica travado (nível, classe, PV máximo,
   * proficiência, atributos, espaços de magia). O servidor também ignora esses campos.
   */
  get travarNivel(): boolean {
    return this.isEditMode && this.personagem.tipoId === 1 && !this.ehMestreNaCampanha;
  }

  campanhas: Campaign[] = [];
  periciasDisponiveis: any[] = [];
  selectedPericiasIds: number[] = [];
  activeTab: string = 'basico';
  isSidebarExpanded: boolean = true;
  tiposPersonagem = [
    { id: 1, nome: 'Herói', descricao: 'Personagem de um jogador', icone: 'bi-person-arms-up' },
    { id: 2, nome: 'NPC', descricao: 'Aliado, figurante ou vilão do Mestre', icone: 'bi-people' },
    { id: 3, nome: 'Monstro', descricao: 'Criatura de combate', icone: 'bi-bug' }
  ];

  // Listas das regras (D&D 2024), usadas como sugestão nos campos
  readonly categoriasNpc = CATEGORIAS_NPC;
  readonly classes = CLASSES;
  readonly especies = ESPECIES;
  readonly antecedentes = ANTECEDENTES;
  readonly alinhamentos = ALINHAMENTOS;
  readonly tamanhos = TAMANHOS;
  readonly tiposDeCriatura = TIPOS_DE_CRIATURA;
  readonly nds = NDS;
  readonly atributos = ATRIBUTOS;
  readonly circulos = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  readonly tiposDeAcao = TIPOS_DE_ACAO;
  readonly tiposDeDano = TIPOS_DE_DANO;
  readonly atributosDeAtaque = ATRIBUTOS_DE_ATAQUE;
  readonly previaDaAcao = previaDaAcao;

  /** Bônus de acerto que a ficha dá para a ação (modificador do atributo + proficiência). */
  bonusDaFicha(acao: any): { valor: number; texto: string } | null {
    const chave = String(acao?.atributoBase ?? '').toLowerCase();
    const valor = bonusDeAtaque(this.personagem.atributo?.[chave], !!acao?.proficiente, this.personagem.personagemCombate?.proficienciaBonus);
    return valor === null ? null : { valor, texto: comSinal(valor) };
  }

  toNumero(v: unknown): number | null {
    return v === null || v === undefined || v === '' ? null : Number(v);
  }

  /** Depois de tentar criar com algo faltando, os campos pendentes ficam destacados. */
  tentouSalvar = false;

  isEditMode: boolean = false;
  personagemId: number | null = null;
  isSaving: boolean = false;

  personagem: any = {
    nome: '',
    descricao: '',
    campanhaId: 0,
    tipoId: 1,
    criadoPorId: 1, // mock
    criadoEm: new Date().toISOString(),
    ativo: true,
    // atributos, PV e CA começam vazios numa ficha nova: quem cria decide os valores
    atributo: { forca: null, destreza: null, constituicao: null, inteligencia: null, sabedoria: null, carisma: null, proficienciaSalvaguardaForca: false, proficienciaSalvaguardaDestreza: false, proficienciaSalvaguardaConstituicao: false, proficienciaSalvaguardaInteligencia: false, proficienciaSalvaguardaSabedoria: false, proficienciaSalvaguardaCarisma: false },
    personagemPlayer: { classe: '', raca: '', nivel: 1, antecedente: '', alinhamento: '', subclasse: '', tamanho: 'Médio', xp: 0 },
    personagemCombate: { vidaMaxima: null, vidaAtual: null, classeArmadura: null, classeArmaduraEscudo: 0, iniciativa: 0, deslocamento: '9m', proficienciaBonus: 2, dadoVidaMaximo: '', dadoVidaGasto: 0, inspiracaoHeroica: false, vidaTemporaria: 0, deathSaveSucessos: 0, deathSaveFalhas: 0 },
    personagemDetalhes: { aparencia: '', historiaPersonalidade: '', tracosEspecie: '', talentos: '', caracteristicasClasse: '', idiomas: '' },
    personagemNpc: { categoriaUso: 'Inimigo', tamanho: 'Médio', tipoCriatura: 'Humanoide', tendencia: 'Imparcial', formulaDadoVida: '', vulnerabilidades: '', resistencias: '', imunidadesDano: '', imunidadesCondicao: '', sentidos: '', nivelDesafio: '1', xpConcedido: 100, vinculosIdeais: '', segredosFaccoes: '', anotacoesLivres: '' },
    personagemConjuracao: { atributoConjuracao: 'Nenhum', slotsNivel1Max: 0, slotsNivel2Max: 0, slotsNivel3Max: 0, slotsNivel4Max: 0, slotsNivel5Max: 0, slotsNivel6Max: 0, slotsNivel7Max: 0, slotsNivel8Max: 0, slotsNivel9Max: 0, slotsNivel1Atual: 0, slotsNivel2Atual: 0, slotsNivel3Atual: 0, slotsNivel4Atual: 0, slotsNivel5Atual: 0, slotsNivel6Atual: 0, slotsNivel7Atual: 0, slotsNivel8Atual: 0, slotsNivel9Atual: 0 },
    personagemAcoesPadrao: [],
    personagemAcoesBonus: [],
    personagemReacoes: [],
    personagemAcoesLendarias: [],
    personagemTracosEspeciais: []
  };

  setTab(tab: string) {
    this.activeTab = tab;
  }

  /** Herói qualquer um cria; NPC e Monstro só o Mestre da campanha escolhida. */
  podeEscolherTipo(tipoId: number): boolean {
    return tipoId === 1 || this.ehMestreNaCampanha;
  }

  escolherTipo(tipoId: number) {
    if (!this.podeEscolherTipo(tipoId)) return;
    this.personagem.tipoId = tipoId;
    // monstro sempre luta: um NPC narrativo que vira monstro passa a ter bloco de combate
    if (tipoId === 3 && this.personagem.personagemNpc.categoriaUso === 'Narrativo') this.personagem.personagemNpc.categoriaUso = 'Inimigo';
    if (!this.abasVisiveis.some(a => a.id === this.activeTab)) this.activeTab = 'basico';
  }

  escolherCategoria(valor: string) {
    this.personagem.personagemNpc.categoriaUso = valor;
  }

  /** NPC de combate, vilão ou monstro: tem bloco de estatísticas (atributos, CA, PV, ND, ações). */
  get comBloco(): boolean {
    return temBlocoDeCombate(this.personagem.tipoId, this.personagem.personagemNpc?.categoriaUso);
  }

  get abasVisiveis(): { id: AbaDaFicha; nome: string }[] {
    const heroi = this.personagem.tipoId === 1;
    const abas: { id: AbaDaFicha; nome: string }[] = [{ id: 'basico', nome: 'Básico' }];
    if (heroi || this.comBloco) abas.push({ id: 'atributos', nome: 'Atributos & Combate' });
    abas.push({ id: 'detalhes', nome: 'Detalhes & História' });
    if (!heroi && this.comBloco) abas.push({ id: 'acoes', nome: 'Ações' });
    return abas;
  }

  /** O que ainda falta para criar, pelas regras do tipo escolhido (a API recusa com o mesmo critério). */
  get faltas(): Falta[] {
    return faltasParaCriar(this.personagem);
  }

  get resumoDoTipo(): string {
    if (this.personagem.tipoId === 1) return 'Para criar o herói, falta:';
    if (this.personagem.tipoId === 3) return 'Para criar o monstro, falta:';
    return this.personagem.personagemNpc?.categoriaUso === 'Vilao' ? 'Para criar o vilão, falta:' : 'Para criar o NPC, falta:';
  }

  pendentesNaAba(aba: AbaDaFicha): number {
    return this.faltas.filter(f => f.aba === aba).length;
  }

  obrig(campo: string): boolean {
    return camposObrigatorios(this.personagem.tipoId, this.personagem.personagemNpc?.categoriaUso, this.personagem.personagemPlayer?.nivel).has(campo);
  }

  /** Campo pendente, destacado só depois de uma tentativa de criar. */
  falta(campo: string): boolean {
    return this.tentouSalvar && !this.isEditMode && this.faltas.some(f => f.campo === campo);
  }

  /** Clicar numa pendência leva à aba e ao campo dela. */
  irPara(f: Falta) {
    this.activeTab = f.aba;
    const ids: Record<string, string> = {
      atributos: 'f-forca', nivelDesafio: 'f-nd', vidaMaxima: 'f-pv', classeArmadura: 'f-ca', deslocamento: 'f-desloc', campanhaId: 'f-campanha',
    };
    setTimeout(() => document.getElementById(ids[f.campo] ?? 'f-' + f.campo)?.focus());
  }

  get classeEscolhida() {
    return this.personagem.tipoId === 1 ? acharClasse(this.personagem.personagemPlayer?.classe) : undefined;
  }

  siglasDe(chaves: Atributo[]): string {
    return chaves.map(c => ATRIBUTOS.find(a => a.chave === c)!.sigla).join(' e ');
  }

  mod(chave: Atributo): string {
    return comSinal(modificador(this.personagem.atributo?.[chave]));
  }

  get ndValido(): boolean {
    return String(this.personagem.personagemNpc?.nivelDesafio ?? '') in XP_POR_ND;
  }

  /** PV pelo valor fixo da classe (herói com classe da lista e CON preenchida). */
  get pvDaRegra(): number | null {
    const cl = this.classeEscolhida;
    const con = this.personagem.atributo?.constituicao;
    if (!cl || con === null || con === undefined || con === '') return null;
    return pvSugerido(cl.dadoVida, Number(this.personagem.personagemPlayer.nivel) || 1, Number(con));
  }

  /** CA sem armadura (10 + modificador de Destreza), sugerida ao criar. */
  get caSemArmadura(): number | null {
    const m = modificador(this.personagem.atributo?.destreza);
    return m === null || this.isEditMode ? null : 10 + m;
  }

  /** Ao escolher a classe numa ficha nova, ela já vem com as salvaguardas, os dados de vida e o atributo de conjuração da classe. */
  aoMudarClasse() {
    const cl = this.classeEscolhida;
    if (!cl || this.isEditMode) return;
    for (const at of ATRIBUTOS) this.personagem.atributo[at.save] = cl.salvaguardas.includes(at.chave);
    this.personagem.personagemConjuracao.atributoConjuracao = cl.conjuracao;
    this.aoMudarNivel();
  }

  aoMudarNivel() {
    if (this.isEditMode || this.personagem.tipoId !== 1) return;
    const nivel = Number(this.personagem.personagemPlayer.nivel);
    if (!(nivel >= 1 && nivel <= 20)) return;
    this.personagem.personagemCombate.proficienciaBonus = bonusDeProficienciaPorNivel(nivel);
    const cl = this.classeEscolhida;
    if (cl) this.personagem.personagemCombate.dadoVidaMaximo = `${nivel}d${cl.dadoVida}`;
  }

  /** O ND define o XP e o bônus de proficiência da criatura. */
  aoMudarNd() {
    const nd = String(this.personagem.personagemNpc.nivelDesafio ?? '');
    if (!(nd in XP_POR_ND)) return;
    this.personagem.personagemNpc.xpConcedido = XP_POR_ND[nd];
    this.personagem.personagemCombate.proficienciaBonus = bonusDeProficienciaPorNd(nd);
  }

  /** 15, 14, 13, 12, 10 e 8, na ordem que favorece a classe (sem classe: na ordem da ficha). */
  usarArranjoPadrao() {
    const ordem = this.classeEscolhida?.prioridade ?? ATRIBUTOS.map(a => a.chave);
    ordem.forEach((chave, i) => this.personagem.atributo[chave] = ARRANJO_PADRAO[i]);
  }

  /** Ao trocar para uma campanha em que não é Mestre, o tipo volta a Herói (o servidor também não aceitaria outro). */
  aoMudarCampanha() {
    if (!this.ehMestreNaCampanha) this.personagem.tipoId = 1;
    // a miniatura é da biblioteca da campanha: trocou de campanha, a escolha anterior não vale
    if (!this.isEditMode) this.miniaturaId = null;
    void this.carregarMiniaturas();
  }

  // ---------- miniatura 3D (WYV-26) ----------

  /** Miniaturas da biblioteca da campanha do personagem. */
  miniaturas: Modelo3d[] = [];
  /** A escolhida (na edição já vale na hora; na criação, vai junto depois de criar). */
  miniaturaId: number | null = null;
  enviandoMiniatura = false;
  /** Tamanho máximo do .glb, como a API informa (15 MB em produção). */
  limiteDoModelo = TAMANHO_MAXIMO_GLB;
  verMiniatura = false;

  get miniaturaEscolhida(): Modelo3d | undefined {
    return this.miniaturas.find(m => m.modeloId === this.miniaturaId);
  }

  readonly buscarMiniatura = (): Promise<ArrayBuffer> => this.modelos3d.arquivo(this.personagem.campanhaId, this.miniaturaId!);

  async carregarMiniaturas(): Promise<void> {
    const campanhaId = this.personagem.campanhaId;
    if (!campanhaId) { this.miniaturas = []; return; }
    try {
      const b = await this.modelos3d.biblioteca(campanhaId);
      if (campanhaId !== this.personagem.campanhaId) return;
      this.miniaturas = b.modelos.filter(m => m.categoria === 'Miniatura');
      this.limiteDoModelo = b.tamanhoMaximoArquivo || TAMANHO_MAXIMO_GLB;
    } catch {
      this.miniaturas = [];
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  async escolherMiniatura(modeloId: number | null): Promise<void> {
    const anterior = this.miniaturaId;
    this.miniaturaId = modeloId;
    this.verMiniatura = false;
    if (!this.isEditMode || !this.personagemId) return;
    try {
      await this.modelos3d.definirMiniatura(this.personagemId, modeloId);
      this.toast.ok(modeloId ? 'Miniatura escolhida: os tokens dele já aparecem com ela no 3D.' : 'Miniatura removida.');
    } catch (err: any) {
      this.miniaturaId = anterior;
      this.toast.erro(err?.error?.message || 'Não foi possível trocar a miniatura.');
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  /** Sobe um .glb para a biblioteca da campanha (como miniatura) e já escolhe para este personagem. */
  async subirMiniatura(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const selecionados = Array.from(campo.files ?? []);
    // um .gltf vem com o .bin e as texturas: a seleção toda vai junto para a conversão
    let arquivo = selecionados.find(a => ehGltf(a.name)) ?? selecionados[0];
    campo.value = '';
    if (!arquivo || !this.personagem.campanhaId) return;
    const eraStl = ehStl(arquivo.name);
    const deImpressao = eraStl || eh3mf(arquivo.name); // medidas de miniatura impressa
    if (ehGltf(arquivo.name)) {
      this.enviandoMiniatura = true;
      this.cdr.detectChanges();
      try {
        arquivo = await converterGltfParaGlb(selecionados);
      } catch (erro) {
        this.enviandoMiniatura = false;
        this.toast.erro(erro instanceof ArquivosDoGltfFaltando
          ? `Selecione junto com o .gltf os arquivos que ele usa: ${erro.nomes.join(', ')}.`
          : 'Não foi possível ler este .gltf.');
        this.cdr.detectChanges();
        return;
      }
    } else if (eh3mf(arquivo.name)) {
      // .3mf (impressão 3D, com cor): vira .glb aqui mesmo, de pé e com as cores do arquivo
      if (arquivo.size > limiteDo3mf(this.limiteDoModelo)) {
        this.toast.erro('Este .3mf é grande demais para converter. Simplifique o modelo (no Blender, modificador “Decimate”).');
        return;
      }
      this.enviandoMiniatura = true;
      this.cdr.detectChanges();
      try {
        arquivo = await converter3mfParaGlb(arquivo);
      } catch {
        this.enviandoMiniatura = false;
        this.toast.erro('Não foi possível ler este .3mf.');
        this.cdr.detectChanges();
        return;
      }
    } else if (eraStl) {
      // .stl (miniatura de impressão 3D): vira .glb aqui mesmo, em pé e em cinza de miniatura
      if (arquivo.size > limiteDoStl(this.limiteDoModelo)) {
        this.toast.erro('Este .stl é grande demais para converter. Simplifique o modelo (no Blender, modificador “Decimate”).');
        return;
      }
      this.enviandoMiniatura = true;
      this.cdr.detectChanges();
      try {
        arquivo = await converterStlParaGlb(arquivo);
      } catch {
        this.enviandoMiniatura = false;
        this.toast.erro('Não foi possível ler este .stl.');
        this.cdr.detectChanges();
        return;
      }
    }
    if (!pareceGlb(await arquivo.slice(0, 12).arrayBuffer(), arquivo.size)) {
      this.enviandoMiniatura = false;
      this.toast.erro('Use um arquivo .glb, .gltf, .stl ou .3mf. No Blender: Exportar → glTF 2.0 → “glTF Binary”.');
      this.cdr.detectChanges();
      return;
    }
    // miniatura de impressão vem com milhões de triângulos: simplifica para a mesa antes de conferir o tamanho
    this.enviandoMiniatura = true;
    this.cdr.detectChanges();
    try {
      const r = await otimizarGlb(arquivo, META_DE_TRIANGULOS.Miniatura);
      if (r) arquivo = r.arquivo;
    } catch (erro) {
      this.enviandoMiniatura = false;
      this.toast.erro(erro instanceof TexturasPerdidas
        ? 'As texturas deste modelo não abriram, e ele ficaria sem cor. Confira se o .glb abre colorido em outro visualizador.'
        : 'Não foi possível otimizar este modelo. Se ele usa compressão Draco ou meshopt, exporte do Blender sem compressão.');
      this.cdr.detectChanges();
      return;
    }
    if (arquivo.size > this.limiteDoModelo) {
      this.enviandoMiniatura = false;
      this.toast.erro(`O modelo ficou com ${formatarTamanho(arquivo.size)} (o limite é ${formatarTamanho(this.limiteDoModelo)}). Diminua as texturas ou simplifique no Blender (modificador “Decimate”).`);
      this.cdr.detectChanges();
      return;
    }
    this.enviandoMiniatura = true;
    this.cdr.detectChanges();
    try {
      const nome = (this.personagem.nome?.trim() || arquivo.name.replace(/\.(glb|gltf|stl|3mf)$/i, '')).slice(0, 80);
      const novo = await this.modelos3d.enviar(this.personagem.campanhaId, arquivo, nome, 'Miniatura', deImpressao ? 'Impressao' : 'Auto');
      await this.carregarMiniaturas();
      await this.escolherMiniatura(novo.modeloId);
    } catch (err: any) {
      this.toast.erro(err?.error?.message || err?.error?.detail || 'Não foi possível subir a miniatura.');
    } finally {
      this.enviandoMiniatura = false;
      this.cdr.detectChanges();
    }
  }

  addAcaoPadrao() { this.personagem.personagemAcoesPadrao.push({ nome: '', descricao: '', alcance: '', bonusAcerto: null, dano: '', tipoDano: '', propriedades: '', atributoBase: 'Forca', proficiente: true, tipoAcao: 'Ataque' }); }
  removeAcaoPadrao(index: number) { this.personagem.personagemAcoesPadrao.splice(index, 1); }

  addAcaoBonus() { this.personagem.personagemAcoesBonus.push({ nome: '', descricao: '' }); }
  removeAcaoBonus(index: number) { this.personagem.personagemAcoesBonus.splice(index, 1); }

  addReacao() { this.personagem.personagemReacoes.push({ nome: '', gatilho: '', descricao: '' }); }
  removeReacao(index: number) { this.personagem.personagemReacoes.splice(index, 1); }

  addAcaoLendaria() { this.personagem.personagemAcoesLendarias.push({ nome: '', custoAcao: null, descricao: '' }); }
  removeAcaoLendaria(index: number) { this.personagem.personagemAcoesLendarias.splice(index, 1); }

  addTracoEspecial() { this.personagem.personagemTracosEspeciais.push({ nome: '', descricao: '' }); }
  removeTracoEspecial(index: number) { this.personagem.personagemTracosEspeciais.splice(index, 1); }

  ngOnInit() {
    this.campaignService.getAll().subscribe({
      next: (data) => {
        this.campanhas = data;
        // Personagem novo já abre com uma campanha escolhida (de preferência uma em que o usuário é Mestre),
        // para o Tipo e os demais campos não ficarem escondidos até alguém escolher.
        // ?campanha=ID (vindo do convite ou da página da campanha) escolhe a campanha, se a pessoa participa dela.
        const pedida = Number(this.route.snapshot.queryParamMap.get('campanha'));
        if (!this.isEditMode && !this.personagem.campanhaId && data.some(c => c.campanhaId === pedida)) {
          this.personagem.campanhaId = pedida;
        }
        if (!this.isEditMode && !this.personagem.campanhaId && data.length) {
          this.personagem.campanhaId = (data.find(c => c.papel === 'Mestre') ?? data[0]).campanhaId;
        }
        if (!this.isEditMode) void this.carregarMiniaturas();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar campanhas:', err)
    });

    this.personagemService.getPericias().subscribe({
      next: (data) => { this.periciasDisponiveis = data; this.cdr.detectChanges(); },
      error: (err) => console.error('Erro ao buscar pericias:', err)
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEditMode = true;
      this.personagemId = +idParam;
      this.loadPersonagem(this.personagemId);
    }
  }

  loadPersonagem(id: number) {
    this.personagemService.getById(id).subscribe({
      next: (data: any) => {
        // Garantir que todos os objetos aninhados existam para o ngModel
        this.personagem = {
          ...data,
          atributo: data.atributo || this.personagem.atributo,
          personagemPlayer: data.personagemPlayer || this.personagem.personagemPlayer,
          personagemCombate: data.personagemCombate || this.personagem.personagemCombate,
          personagemDetalhes: data.personagemDetalhes || this.personagem.personagemDetalhes,
          personagemNpc: data.personagemNpc || this.personagem.personagemNpc,
          personagemConjuracao: data.personagemConjuracao || this.personagem.personagemConjuracao,
          personagemAcoesPadrao: data.personagemAcoesPadrao || [],
          personagemAcoesBonus: data.personagemAcoesBonus || [],
          personagemReacoes: data.personagemReacoes || [],
          personagemAcoesLendarias: data.personagemAcoesLendarias || [],
          personagemTracosEspeciais: data.personagemTracosEspeciais || []
        };
        
        if (data.personagemPericias) {
          this.selectedPericiasIds = data.personagemPericias.map((p: any) => p.periciaId);
        }
        this.miniaturaId = data.modeloId ?? null;
        void this.carregarMiniaturas();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao carregar personagem:', err)
    });
  }

  togglePericia(id: number) {
    const index = this.selectedPericiasIds.indexOf(id);
    if (index > -1) {
      this.selectedPericiasIds.splice(index, 1);
    } else {
      this.selectedPericiasIds.push(id);
    }
  }

  save() {
    if (this.isSaving) return;

    // Ao criar, vale a regra do tipo (a mesma da API). Ao editar, só nome e campanha: fichas antigas seguem editáveis.
    if (!this.isEditMode) {
      const faltas = this.faltas;
      if (faltas.length) {
        this.tentouSalvar = true;
        this.activeTab = faltas[0].aba;
        const mais = faltas.length > 1 ? ` (e mais ${faltas.length - 1})` : '';
        this.toast.erro(`Falta para criar: ${faltas[0].mensagem.replace(/\.$/, '')}${mais}.`);
        this.cdr.markForCheck();
        return;
      }
    }

    if (!this.personagem.nome || this.personagem.nome.trim() === '') {
      this.activeTab = 'basico';
      this.toast.erro('Dê um nome ao personagem na aba Básico antes de salvar.');
      return;
    }
    if (!this.personagem.campanhaId) {
      this.activeTab = 'basico';
      this.toast.erro('Escolha a campanha do personagem na aba Básico antes de salvar.');
      return;
    }

    this.personagem.periciasIds = this.selectedPericiasIds;

    // Ao CRIAR, o personagem começa com vida cheia e todos os espaços de magia.
    // Ao EDITAR, vida atual e espaços gastos são preservados (antes, salvar a edição curava o personagem
    // e recarregava as magias).
    if (!this.isEditMode) {
      if (this.personagem.personagemConjuracao) {
        for (let i = 1; i <= 9; i++) {
          if (this.personagem.personagemConjuracao['slotsNivel' + i + 'Max'] > 0) {
            this.personagem.personagemConjuracao['slotsNivel' + i + 'Atual'] = this.personagem.personagemConjuracao['slotsNivel' + i + 'Max'];
          }
        }
      }

      if (this.personagem.personagemCombate) {
        this.personagem.personagemCombate.vidaAtual = this.personagem.personagemCombate.vidaMaxima;
      }
    } else if (this.personagem.personagemCombate) {
      // Se o máximo baixou abaixo da vida atual, a vida atual acompanha o novo máximo.
      const { vidaAtual, vidaMaxima } = this.personagem.personagemCombate;
      if (vidaAtual > vidaMaxima) this.personagem.personagemCombate.vidaAtual = vidaMaxima;
    }

    if (this.personagem.personagemAcoesPadrao) {
      this.personagem.personagemAcoesPadrao = this.personagem.personagemAcoesPadrao.filter((a: any) => a.nome && a.nome.trim() !== '');
      this.personagem.personagemAcoesPadrao.forEach((a: any) => a.bonusAcerto = Number(a.bonusAcerto) || 0);
    }
    if (this.personagem.personagemAcoesLendarias) {
      this.personagem.personagemAcoesLendarias = this.personagem.personagemAcoesLendarias.filter((a: any) => a.nome && a.nome.trim() !== '');
      this.personagem.personagemAcoesLendarias.forEach((a: any) => a.custoAcao = (a.custoAcao !== null && a.custoAcao !== '') ? String(a.custoAcao) : '1');
    }
    if (this.personagem.personagemAcoesBonus) {
      this.personagem.personagemAcoesBonus = this.personagem.personagemAcoesBonus.filter((a: any) => a.nome && a.nome.trim() !== '');
    }
    if (this.personagem.personagemReacoes) {
      this.personagem.personagemReacoes = this.personagem.personagemReacoes.filter((a: any) => a.nome && a.nome.trim() !== '');
    }
    if (this.personagem.personagemTracosEspeciais) {
      this.personagem.personagemTracosEspeciais = this.personagem.personagemTracosEspeciais.filter((a: any) => a.nome && a.nome.trim() !== '');
    }

    // Duplicate Padrão Actions marked as Ataque/Magia to the combat/magic tabs
    if (this.personagem.personagemAcoesPadrao && this.personagem.personagemAcoesPadrao.length > 0) {
      if (!this.personagem.personagemAtaques) this.personagem.personagemAtaques = [];
      if (!this.personagem.personagemMagias) this.personagem.personagemMagias = [];
      
      // Só espelha ações que ainda não existem nas abas (comparando pelo nome): sem isso, cada salvamento de
      // uma edição duplicava todos os ataques e magias.
      const jaTemAtaque = (nome: string) => this.personagem.personagemAtaques.some((a: any) => a.nome === nome);
      const jaTemMagia = (nome: string) => this.personagem.personagemMagias.some((m: any) => m.nome === nome);

      this.personagem.personagemAcoesPadrao.forEach((acao: any) => {
        if (acao.tipoAcao === 'Ataque' && !jaTemAtaque(acao.nome)) {
          this.personagem.personagemAtaques.push({
            nome: acao.nome,
            alcance: acao.alcance || '',
            bonusAcerto: Number(acao.bonusAcerto) || 0,
            dano: acao.dano || '',
            tipoDano: acao.tipoDano || '',
            propriedades: acao.propriedades || '',
            atributoBase: acao.atributoBase || 'Forca',
            proficiente: acao.proficiente || false
          });
        } else if (acao.tipoAcao === 'Magia' && !jaTemMagia(acao.nome)) {
          this.personagem.personagemMagias.push({
            nome: acao.nome,
            descricao: acao.descricao || '',
            nivel: 0,
            escola: 'Desconhecida'
          });
        }
      });
    }

    const payload = JSON.parse(JSON.stringify(this.personagem));

    if (payload.tipoId === 1) {
      payload.personagemNpc = null;
      payload.personagemAcoesPadrao = null;
      payload.personagemAcoesBonus = null;
      payload.personagemReacoes = null;
      payload.personagemAcoesLendarias = null;
      payload.personagemTracosEspeciais = null;
    } else {
      payload.personagemPlayer = null;
    }

    if (this.isEditMode && this.personagemId) {
      this.isSaving = true;
      payload.personagemId = this.personagemId;
      this.personagemService.update(this.personagemId, payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.toast.ok('Personagem atualizado.');
          this.router.navigate(['/personagens']);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao atualizar personagem', err);
          this.toast.erro('Não foi possível salvar as alterações. Confira os dados e tente de novo.');
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isSaving = true;
      this.personagemService.create(payload).subscribe({
        next: (criado: any) => {
          this.isSaving = false;
          // a miniatura só pode ser gravada depois que o personagem existe
          if (this.miniaturaId && criado?.personagemId) {
            this.modelos3d.definirMiniatura(criado.personagemId, this.miniaturaId).catch(() =>
              this.toast.erro('O personagem foi criado, mas a miniatura não foi gravada. Escolha de novo ao editar a ficha.'));
          }
          this.toast.ok('Personagem criado.');
          this.router.navigate(['/personagens']);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao criar personagem', err);
          this.toast.erro(err?.error?.message || 'Não foi possível criar o personagem. Confira os dados e tente de novo.');
          this.cdr.detectChanges();
        }
      });
    }
  }
}
