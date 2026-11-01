import { Component, OnInit, Input, SimpleChanges, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
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

  carregarDados() {
    if (!this.campanhaId) return;
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

  togglePreview() {
    this.showPreview = !this.showPreview;
    if (this.showPreview) {
      this.updatePreview(this.editConteudo);
    }
  }

  async updatePreview(content: string) {
    this.previewHtml = await marked.parse(content);
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
