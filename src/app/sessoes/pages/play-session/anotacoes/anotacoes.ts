import { Component, OnInit, Input, SimpleChanges, OnChanges, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnotacaoService, Anotacao, CreateAnotacaoDto, UpdateAnotacaoDto } from '../../../services/anotacao.service';
import { PastaAnotacaoService } from '../../../services/pasta-anotacao.service';
import { PastaAnotacao } from '../../../models/pasta-anotacao.model';
import { marked } from 'marked';
import { AuthService } from '../../../../core/services/auth.service';
import { PapelService } from '../../../../campaigns/services/papel.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ConfirmService } from '../../../../shared/ui/confirm/confirm.service';
import { PersonagemService } from '../../../../personagens/services/personagem.service';
import { CampaignService } from '../../../../campaigns/services/campaign';
import { MODELO_ROTEIRO, Mencionavel, alternarTarefa, prepararMarkdown } from '../../../utils/anotacao-markdown';

@Component({
  selector: 'app-anotacoes',
  imports: [CommonModule, FormsModule],
  templateUrl: './anotacoes.html',
  styleUrl: './anotacoes.scss'
})
export class Anotacoes implements OnInit, OnChanges {
  @Input() campanhaId!: number;
  private anotacaoService = inject(AnotacaoService);
  private pastaService = inject(PastaAnotacaoService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private papelService = inject(PapelService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  private personagens = inject(PersonagemService);
  private campanhas = inject(CampaignService);

  userRole: string = 'Jogador';
  currentUserId!: number;

  pastas: PastaAnotacao[] = [];
  anotacoes: Anotacao[] = [];
  
  // State
  pastaSelecionada: PastaAnotacao | null = null;
  anotacaoSelecionada: Anotacao | null = null;
  
  // Editor State
  isEditing = false;
  editTitulo = '';
  editConteudo = '';
  editIsPublica = false;
  // Texto vindo de outros usuários: o Angular sanitiza ao atribuir via [innerHTML] (sem bypass).
  previewHtml = '';
  showPreview = false; // Toggle between write/preview in seamless mode

  // Menções: personagens da campanha (com link, se o usuário pode abrir a ficha) e membros (só destaque)
  conhecidos: Mencionavel[] = [];
  @ViewChild('conteudoNota') private conteudoNota?: ElementRef<HTMLTextAreaElement>;

  // Folder Edit
  isCreatingPasta = false;
  newPastaName = '';
  newPastaPublic = false;

  ngOnInit() {
    this.currentUserId = this.authService.currentUserValue?.usuarioId;
    this.carregarPapel();
    this.carregarDados();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['campanhaId'] && !changes['campanhaId'].firstChange) {
      this.carregarPapel();
      this.carregarDados();
    }
  }

  // Papel do usuário NESTA campanha; começa restrito ('Jogador') até a API responder
  private carregarPapel() {
    if (!this.campanhaId) return;
    this.papelService.papelNaCampanha(this.campanhaId).subscribe({
      next: (papel) => {
        this.userRole = papel ?? 'Jogador';
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao descobrir o papel na campanha', err)
    });
  }

  /** Nomes que podem ser mencionados com @: os personagens da campanha e quem participa dela. */
  private carregarMencionaveis() {
    if (!this.campanhaId) return;
    const id = this.campanhaId;
    this.personagens.getAll().subscribe({
      next: lista => {
        const fichas: Mencionavel[] = lista.filter(p => p.campanhaId === id && p.personagemId !== undefined)
          .map(p => ({ nome: p.nome, personagemId: p.personagemId }));
        this.conhecidos = [...fichas, ...this.conhecidos.filter(c => c.personagemId === undefined && !fichas.some(f => f.nome === c.nome))];
        void this.atualizarSeAberta();
      },
    });
    this.campanhas.getMembros(id).subscribe({
      next: membros => {
        const comFicha = new Set(this.conhecidos.filter(c => c.personagemId !== undefined).map(c => c.nome.toLowerCase()));
        const pessoas = membros.filter(m => !comFicha.has(m.nome.toLowerCase())).map(m => ({ nome: m.nome }));
        this.conhecidos = [...this.conhecidos.filter(c => c.personagemId !== undefined), ...pessoas];
        void this.atualizarSeAberta();
      },
    });
  }

  private async atualizarSeAberta() {
    if (this.anotacaoSelecionada && !this.isEditing) await this.updatePreview(this.anotacaoSelecionada.conteudo);
    this.cdr.detectChanges();
  }

  carregarDados() {
    if (!this.campanhaId) return;
    this.carregarMencionaveis();
    this.pastaService.getPastasByCampanha(this.campanhaId).subscribe({
      next: (pastas) => {
        this.pastas = pastas;
        this.cdr.detectChanges();
      }
    });

    this.anotacaoService.getAnotacoesByCampanha(this.campanhaId).subscribe({
      next: (data) => {
        this.anotacoes = data;
        this.cdr.detectChanges();
      }
    });
  }

  getAnotacoesDaPasta(pastaId?: number): Anotacao[] {
    return this.anotacoes.filter(a => (a.pastaId || null) === (pastaId || null));
  }

  podeEditar(a: Anotacao): boolean {
    return a.criadoPorId === this.currentUserId;
  }

  podeDeletar(a: Anotacao): boolean {
    return a.criadoPorId === this.currentUserId;
  }

  novaPasta() {
    this.isCreatingPasta = true;
    this.newPastaName = '';
    this.newPastaPublic = false;
  }

  salvarPasta() {
    if (!this.newPastaName.trim()) return;
    const dto: PastaAnotacao = {
      campanhaId: this.campanhaId,
      nome: this.newPastaName,
      isPublica: this.newPastaPublic
    };
    this.pastaService.createPasta(dto).subscribe({
      next: (pasta) => {
        this.pastas.push(pasta);
        this.isCreatingPasta = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  cancelarPasta() {
    this.isCreatingPasta = false;
  }

  selecionarAnotacao(a: Anotacao) {
    this.anotacaoSelecionada = a;
    this.isEditing = false;
    this.showPreview = true;
    this.updatePreview(a.conteudo);
    this.cdr.detectChanges();
  }

  novaAnotacao(pastaId?: number) {
    this.anotacaoSelecionada = null;
    this.pastaSelecionada = pastaId ? this.pastas.find(p => p.pastaId === pastaId) || null : null;
    this.isEditing = true;
    this.showPreview = false;
    this.editTitulo = '';
    this.editConteudo = '';
    this.editIsPublica = false;
    this.updatePreview('');
  }

  editarAnotacao() {
    if (this.anotacaoSelecionada) {
      this.isEditing = true;
      this.showPreview = false;
      this.editTitulo = this.anotacaoSelecionada.titulo;
      this.editConteudo = this.anotacaoSelecionada.conteudo;
      this.editIsPublica = this.anotacaoSelecionada.isPublica;
      this.pastaSelecionada = this.anotacaoSelecionada.pastaId ? this.pastas.find(p => p.pastaId === this.anotacaoSelecionada!.pastaId) || null : null;
    }
  }

  cancelarEdicao() {
    this.isEditing = false;
    if (this.anotacaoSelecionada) {
      this.selecionarAnotacao(this.anotacaoSelecionada);
    }
  }

  // Mestre exclui qualquer pasta; o autor, a própria (o servidor confere de novo)
  podeExcluirPasta(p: PastaAnotacao): boolean {
    return this.userRole === 'Mestre' || (p.criadoPorId != null && p.criadoPorId === this.currentUserId);
  }

  // No celular, lista e nota se alternam: este botão volta para a lista
  voltarParaLista() {
    this.isEditing = false;
    this.anotacaoSelecionada = null;
    this.cdr.detectChanges();
  }

  togglePreview() {
    this.showPreview = !this.showPreview;
    if (this.showPreview) {
      this.updatePreview(this.editConteudo);
    }
  }

  async updatePreview(content: string) {
    this.previewHtml = await marked.parse(prepararMarkdown(content, this.conhecidos));
    // sem zone.js, o que termina depois de um await só aparece se a tela for redesenhada
    this.cdr.detectChanges();
  }

  salvarAnotacao() {
    if (!this.editTitulo.trim()) {
      this.toast.erro('Dê um título à anotação antes de salvar.');
      return;
    }

    if (this.anotacaoSelecionada) {
      const dto: UpdateAnotacaoDto = {
        titulo: this.editTitulo,
        conteudo: this.editConteudo,
        isPublica: this.editIsPublica,
        pastaId: this.pastaSelecionada?.pastaId
      };
      this.anotacaoService.update(this.anotacaoSelecionada.anotacaoId, dto).subscribe({
        next: () => {
          this.isEditing = false;
          this.showPreview = true;
          this.anotacaoSelecionada = { ...this.anotacaoSelecionada!, ...dto };
          this.updatePreview(this.anotacaoSelecionada.conteudo);
          // Atualiza lista local
          const index = this.anotacoes.findIndex(a => a.anotacaoId === this.anotacaoSelecionada!.anotacaoId);
          if (index !== -1) this.anotacoes[index] = this.anotacaoSelecionada;
          this.cdr.detectChanges();
        }
      });
    } else {
      const dto: CreateAnotacaoDto = {
        campanhaId: this.campanhaId,
        pastaId: this.pastaSelecionada?.pastaId,
        titulo: this.editTitulo,
        conteudo: this.editConteudo,
        isPublica: this.editIsPublica
      };
      this.anotacaoService.create(dto).subscribe({
        next: (nova) => {
          this.anotacoes.push(nova);
          this.selecionarAnotacao(nova);
        }
      });
    }
  }


  // ----- recursos de caderno: menções, checklist, roteiro e revelar -----
  /** Clique no texto lido: marca uma tarefa ou abre a ficha de uma menção. */
  aoClicarConteudo(ev: Event) {
    const alvo = ev.target as HTMLElement | null;

    const tarefa = alvo?.closest('.tarefa');
    if (tarefa) {
      this.marcarTarefa(tarefa as HTMLElement);
      return;
    }

    const link = alvo?.closest('a');
    const destino = link?.getAttribute('href') ?? '';
    if (destino.startsWith('/ficha/')) {
      ev.preventDefault();
      void this.router.navigateByUrl(destino);
    }
  }

  /** Espaço ou Enter numa caixa de tarefa focada, como numa caixa de seleção de verdade. */
  aoTeclarConteudo(ev: KeyboardEvent) {
    const alvo = ev.target as HTMLElement | null;
    if ((ev.key === ' ' || ev.key === 'Enter') && alvo?.classList.contains('tarefa')) {
      ev.preventDefault();
      this.marcarTarefa(alvo);
    }
  }

  private marcarTarefa(caixa: HTMLElement) {
    const nota = this.anotacaoSelecionada;
    if (!nota) return;
    if (!this.podeEditar(nota) && this.userRole !== 'Mestre') {
      this.toast.info('Só quem escreveu a anotação pode marcar as tarefas.');
      return;
    }

    // a posição da caixa entre todas as caixas do texto é a posição da tarefa no markdown
    const todas = Array.from(caixa.closest('.markdown-content')?.querySelectorAll('.tarefa') ?? []);
    const indice = todas.indexOf(caixa);
    if (indice < 0) return;

    const conteudo = alternarTarefa(nota.conteudo, indice);
    this.salvarConteudo(nota, conteudo, 'Não foi possível marcar a tarefa.');
  }

  private salvarConteudo(nota: Anotacao, conteudo: string, erro: string, extra: Partial<UpdateAnotacaoDto> = {}) {
    const dto: UpdateAnotacaoDto = { titulo: nota.titulo, conteudo, isPublica: nota.isPublica, pastaId: nota.pastaId, ...extra };
    this.anotacaoService.update(nota.anotacaoId, dto).subscribe({
      next: () => {
        this.anotacaoSelecionada = { ...nota, ...dto };
        const i = this.anotacoes.findIndex(a => a.anotacaoId === nota.anotacaoId);
        if (i !== -1) this.anotacoes[i] = this.anotacaoSelecionada;
        void this.atualizarSeAberta();
      },
      error: () => this.toast.erro(erro),
    });
  }

  /** O Mestre mostra (ou esconde) a anotação para os jogadores com um clique, sem abrir o editor. */
  alternarRevelacao() {
    const nota = this.anotacaoSelecionada;
    if (!nota || this.userRole !== 'Mestre') return;
    const revelar = !nota.isPublica;
    this.salvarConteudo(nota, nota.conteudo, 'Não foi possível mudar a visibilidade.', { isPublica: revelar });
    this.toast.ok(revelar ? 'Anotação revelada aos jogadores.' : 'Anotação escondida dos jogadores.');
  }

  /** Insere "@Nome " onde está o cursor do editor. */
  inserirMencao(nome: string) {
    if (!nome) return;
    this.inserirNoCursor(`@${nome} `);
  }

  inserirChecklist() {
    const area = this.conteudoNota?.nativeElement;
    const antes = area ? this.editConteudo.slice(0, area.selectionStart) : this.editConteudo;
    // começa em linha nova, se o cursor não estiver no começo de uma
    this.inserirNoCursor(antes === '' || antes.endsWith('\n') ? '- [ ] ' : '\n- [ ] ');
  }

  private inserirNoCursor(texto: string) {
    const area = this.conteudoNota?.nativeElement;
    const inicio = area?.selectionStart ?? this.editConteudo.length;
    const fim = area?.selectionEnd ?? inicio;
    this.editConteudo = this.editConteudo.slice(0, inicio) + texto + this.editConteudo.slice(fim);
    this.cdr.detectChanges();
    if (area) {
      area.focus();
      area.setSelectionRange(inicio + texto.length, inicio + texto.length);
    }
  }

  /** Abre o editor já com o modelo de roteiro de sessão (cenas, segredos, personagens e tesouro em checklists). */
  novoRoteiro(pastaId?: number) {
    this.novaAnotacao(pastaId);
    this.editTitulo = 'Roteiro da sessão';
    this.editConteudo = MODELO_ROTEIRO;
    this.cdr.detectChanges();
  }

  async excluirAnotacao(id: number, event: Event) {
    event.stopPropagation();
    if (await this.confirm.confirmar({ titulo: 'Excluir anotação', mensagem: 'Esta anotação será excluída e não poderá ser recuperada.', confirmar: 'Excluir', perigo: true })) {
      this.anotacaoService.delete(id).subscribe({
        next: () => {
          this.anotacoes = this.anotacoes.filter(a => a.anotacaoId !== id);
          if (this.anotacaoSelecionada?.anotacaoId === id) {
            this.anotacaoSelecionada = null;
            this.isEditing = false;
          }
          this.cdr.detectChanges();
        }
      });
    }
  }

  async excluirPasta(id: number, event: Event) {
    event.stopPropagation();
    if (await this.confirm.confirmar({ titulo: 'Excluir pasta', mensagem: 'A pasta e TODAS as anotações dentro dela serão excluídas e não poderão ser recuperadas.', confirmar: 'Excluir pasta', perigo: true })) {
      this.pastaService.deletePasta(id).subscribe({
        next: () => {
          this.pastas = this.pastas.filter(p => p.pastaId !== id);
          this.anotacoes = this.anotacoes.filter(a => a.pastaId !== id);
          if (this.anotacaoSelecionada?.pastaId === id) {
            this.anotacaoSelecionada = null;
            this.isEditing = false;
          }
          this.cdr.detectChanges();
        }
      });
    }
  }
}
