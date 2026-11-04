import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CampaignService } from '../../services/campaign';
import { Campaign, Membro } from '../../models/campaign';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SessaoService } from '../../../sessoes/services/sessao.service';
import { Sessao } from '../../../sessoes/models/sessao';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { Personagem } from '../../../personagens/models/personagem';
import { Emblema, matizDoNome } from '../../../shared/ui/emblema/emblema';

@Component({
  selector: 'app-campaign-detail',
  imports: [CommonModule, RouterModule, Emblema],
  templateUrl: './campaign-detail.html',
  styleUrl: './campaign-detail.scss',
})
export class CampaignDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignService = inject(CampaignService);
  private cdr = inject(ChangeDetectorRef);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private sessaoService = inject(SessaoService);
  private personagemService = inject(PersonagemService);

  campaign: Campaign | null = null;
  isLoading = true;

  // O papel é por campanha: vem da API junto com a campanha (o servidor valida toda ação de qualquer jeito).
  get ehMestre(): boolean {
    return this.campaign?.papel === 'Mestre';
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.campaignService.getById(id).subscribe({
        next: (data) => {
          this.campaign = data;
          this.isLoading = false;
          this.loadMembros();
          this.loadConteudo(id);
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Erro ao buscar campanha', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ----- Conteúdo da campanha (sessões e heróis) -----
  sessoes: Sessao[] = [];
  herois: Personagem[] = [];

  private loadConteudo(id: number) {
    this.sessaoService.getAll().subscribe({
      next: lista => {
        this.sessoes = lista.filter(s => s.campanhaId === id).sort((a, b) => b.numeroSessao - a.numeroSessao);
        this.cdr.detectChanges();
      },
    });
    this.personagemService.getAll().subscribe({
      next: lista => {
        this.herois = lista.filter(p => p.campanhaId === id && p.tipoId === 1);
        this.cdr.detectChanges();
      },
    });
  }

  /** Fundo da faixa de abertura: o mesmo matiz do brasão. */
  get capa(): string {
    const h = matizDoNome(this.campaign?.nome ?? '');
    return `radial-gradient(ellipse 60% 140% at 90% 0%, hsl(${h} 45% 30% / 0.85), transparent 70%), linear-gradient(160deg, hsl(${h} 38% 15%), hsl(${h} 30% 8%))`;
  }

  async deleteCampaign() {
    if (!this.campaign?.campanhaId) return;
    const id = this.campaign.campanhaId;

    const confirmado = await this.confirm.confirmar({
      titulo: 'Excluir campanha',
      mensagem: `“${this.campaign.nome}” sairá da lista de todos os membros. Esta ação não pode ser desfeita.`,
      confirmar: 'Excluir campanha',
      perigo: true,
    });
    if (!confirmado) return;

    this.campaignService.delete(id).subscribe({
      next: () => {
        this.toast.ok('Campanha excluída.');
        this.router.navigate(['/campaigns']);
      },
      error: (err) => {
        console.error('Erro ao deletar campanha', err);
        this.toast.erro('Não foi possível excluir a campanha. Tente novamente.');
      }
    });
  }

  // ----- Convite -----
  inviteUrl: string | null = null;
  inviteExpiraEm: string | null = null;
  inviteMessage = '';
  inviteBusy = false;

  // O link sempre aponta para o domínio de produção, mesmo quando o Mestre está em localhost.
  private buildInviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  private showInviteMessage(message: string) {
    this.inviteMessage = message;
    this.cdr.detectChanges();
  }

  // Mostra o link atual (cria um se ainda não existir ou se expirou); clicar de novo não muda o link.
  generateInvite(renovar = false) {
    if (!this.campaign?.campanhaId || this.inviteBusy) return;

    this.inviteBusy = true;
    this.campaignService.generateInvite(this.campaign.campanhaId, renovar).subscribe({
      next: (res) => {
        this.inviteBusy = false;
        this.inviteUrl = this.buildInviteUrl(res.token);
        // A API manda a data em UTC sem sufixo "Z"
        this.inviteExpiraEm = res.expiraEm ? (res.expiraEm.endsWith('Z') ? res.expiraEm : res.expiraEm + 'Z') : null;
        this.showInviteMessage(renovar ? 'Novo link gerado. O link anterior deixou de funcionar.' : '');
      },
      error: (err) => {
        console.error(err);
        this.inviteBusy = false;
        this.showInviteMessage('Não foi possível gerar o convite. Tente novamente.');
      }
    });
  }

  async renewInvite() {
    if (await this.confirm.confirmar({ titulo: 'Gerar novo link', mensagem: 'O link anterior deixará de funcionar para quem ainda não entrou.', confirmar: 'Gerar novo link' })) {
      this.generateInvite(true);
    }
  }

  async revokeInvite() {
    if (!this.campaign?.campanhaId || this.inviteBusy) return;
    if (!(await this.confirm.confirmar({ titulo: 'Desativar convite', mensagem: 'Ninguém mais conseguirá entrar na campanha por este link.', confirmar: 'Desativar', perigo: true }))) return;

    this.inviteBusy = true;
    this.campaignService.revokeInvite(this.campaign.campanhaId).subscribe({
      next: () => {
        this.inviteBusy = false;
        this.inviteUrl = null;
        this.inviteExpiraEm = null;
        this.showInviteMessage('Link de convite desativado.');
      },
      error: (err) => {
        console.error(err);
        this.inviteBusy = false;
        this.showInviteMessage('Não foi possível desativar o convite.');
      }
    });
  }

  async copyInvite() {
    if (!this.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.showInviteMessage('Link copiado!');
    } catch {
      this.showInviteMessage('Não foi possível copiar automaticamente. Selecione o link e copie.');
    }
  }

  // ----- Membros -----
  membros: Membro[] = [];
  membrosMessage = '';
  membrosBusy = false;

  get voce(): Membro | undefined {
    return this.membros.find(m => m.ehVoce);
  }

  loadMembros() {
    if (!this.campaign?.campanhaId) return;
    this.campaignService.getMembros(this.campaign.campanhaId).subscribe({
      next: (lista) => {
        this.membros = lista;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao buscar membros', err)
    });
  }

  private showMembrosMessage(message: string) {
    this.membrosMessage = message;
    this.membrosBusy = false;
    this.cdr.detectChanges();
  }

  // Mensagem do servidor (ex.: "a campanha precisa de pelo menos um Mestre") ou uma genérica
  private erroDe(err: HttpErrorResponse, padrao: string): string {
    return err.error?.detail || (typeof err.error === 'string' && err.error) || padrao;
  }

  async mudarPapel(membro: Membro, papel: 'Mestre' | 'Jogador') {
    if (!this.campaign?.campanhaId || this.membrosBusy) return;
    if (papel === 'Jogador' && !(await this.confirm.confirmar({ titulo: 'Rebaixar a Jogador', mensagem: `${membro.nome} deixará de poder gerenciar esta campanha.`, confirmar: 'Rebaixar' }))) return;

    this.membrosBusy = true;
    this.campaignService.setPapel(this.campaign.campanhaId, membro.usuarioId, papel).subscribe({
      next: () => {
        this.showMembrosMessage(`${membro.nome} agora é ${papel}.`);
        this.loadMembros();
        // Se o Mestre se rebaixou, a própria tela precisa refletir o novo papel
        if (membro.ehVoce) this.recarregarCampanha();
      },
      error: (err) => this.showMembrosMessage(this.erroDe(err, 'Não foi possível alterar o papel.'))
    });
  }

  async remover(membro: Membro) {
    if (!this.campaign?.campanhaId || this.membrosBusy) return;
    if (!(await this.confirm.confirmar({ titulo: 'Remover da campanha', mensagem: `${membro.nome} perderá o acesso à campanha.`, confirmar: 'Remover', perigo: true }))) return;

    this.membrosBusy = true;
    this.campaignService.removeMembro(this.campaign.campanhaId, membro.usuarioId).subscribe({
      next: () => {
        this.showMembrosMessage(`${membro.nome} foi removido.`);
        this.loadMembros();
      },
      error: (err) => this.showMembrosMessage(this.erroDe(err, 'Não foi possível remover o membro.'))
    });
  }

  async sair() {
    const eu = this.voce;
    if (!this.campaign?.campanhaId || !eu || this.membrosBusy) return;
    if (!(await this.confirm.confirmar({ titulo: 'Sair da campanha', mensagem: 'Você perde o acesso à campanha e aos personagens que criou nela.', confirmar: 'Sair', perigo: true }))) return;

    this.membrosBusy = true;
    this.campaignService.removeMembro(this.campaign.campanhaId, eu.usuarioId).subscribe({
      next: () => this.router.navigate(['/campaigns']),
      error: (err) => this.showMembrosMessage(this.erroDe(err, 'Não foi possível sair da campanha.'))
    });
  }

  private recarregarCampanha() {
    if (!this.campaign?.campanhaId) return;
    this.campaignService.getById(this.campaign.campanhaId).subscribe({
      next: (data) => {
        this.campaign = data;
        this.cdr.detectChanges();
      }
    });
  }
}
