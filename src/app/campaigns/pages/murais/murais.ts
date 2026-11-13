import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MuralService } from '../../services/mural.service';
import { CampaignService } from '../../services/campaign';
import { MuralResumo } from '../../models/mural';
import { ConfirmService } from '../../../shared/ui/confirm/confirm.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

/** Os murais da campanha (só o Mestre chega aqui; para os jogadores a API responde 403). */
@Component({
  selector: 'app-murais',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './murais.html',
  styleUrl: './murais.scss',
})
export class Murais implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private murais = inject(MuralService);
  private campanhas = inject(CampaignService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  readonly campanhaId = Number(this.route.snapshot.paramMap.get('id'));
  readonly campanhaNome = signal('');
  readonly lista = signal<MuralResumo[]>([]);
  readonly carregando = signal(true);
  readonly semPermissao = signal(false);
  readonly criando = signal(false);
  nome = '';

  ngOnInit() {
    this.campanhas.getById(this.campanhaId).subscribe({ next: c => this.campanhaNome.set(c.nome) });
    this.murais.listar(this.campanhaId).subscribe({
      next: lista => {
        this.lista.set(lista);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.semPermissao.set(err.status === 403 || err.status === 404);
        this.carregando.set(false);
        if (!this.semPermissao()) this.toast.erro('Não foi possível carregar os murais.');
      },
    });
  }

  criar() {
    const nome = this.nome.trim() || 'Mural sem nome';
    if (this.criando()) return;
    this.criando.set(true);
    this.murais.criar(this.campanhaId, nome).subscribe({
      next: m => void this.router.navigate(['/campaigns', this.campanhaId, 'murais', m.muralId]),
      error: (err: HttpErrorResponse) => {
        this.criando.set(false);
        this.toast.erro(err.error?.message || err.error?.detail || 'Não foi possível criar o mural.');
      },
    });
  }

  async excluir(m: MuralResumo) {
    const ok = await this.confirm.confirmar({
      titulo: 'Excluir mural',
      mensagem: `"${m.nome}" e tudo o que está nele (notas, imagens e setas) serão apagados. Não dá para desfazer.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    this.murais.excluir(this.campanhaId, m.muralId).subscribe({
      next: () => {
        this.lista.update(l => l.filter(x => x.muralId !== m.muralId));
        this.toast.ok('Mural excluído.');
      },
      error: () => this.toast.erro('Não foi possível excluir o mural.'),
    });
  }
}
