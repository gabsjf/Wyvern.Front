import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CampaignService } from '../../services/campaign';
import { AuthService } from '../../../core/services/auth.service';
import { Emblema, capaDoNome } from '../../../shared/ui/emblema/emblema';

export interface SistemaSugerido {
  nome: string;
  /** Uma linha sobre o estilo do jogo, para ajudar a escolher. */
  tom: string;
}

/** Os sistemas mais jogados nas mesas brasileiras; qualquer outro entra em "Outro sistema". */
export const SISTEMAS: SistemaSugerido[] = [
  { nome: 'D&D 5e', tom: 'Fantasia heroica clássica' },
  { nome: 'Tormenta20', tom: 'Fantasia brasileira em Arton' },
  { nome: 'Ordem Paranormal', tom: 'Investigação e horror' },
  { nome: 'Pathfinder 2e', tom: 'Fantasia tática e detalhada' },
  { nome: 'Call of Cthulhu', tom: 'Horror cósmico' },
  { nome: 'Vampiro: A Máscara', tom: 'Intriga e horror pessoal' },
];

const INICIOS = ['A Queda de', 'O Juramento de', 'As Cinzas de', 'A Coroa de', 'O Eco de', 'Sombras sobre', 'O Último Inverno de', 'Os Herdeiros de', 'A Maldição de', 'O Cerco a'];
const LUGARES = ['Vael', 'Karth Dorum', 'Pedra-Funda', 'Lys', 'Mor Aran', 'Valdren', 'Ossário Rubro', 'Thaelor', 'Brumavale', 'Kesh'];

/** Mesmo limite que a capa aguenta sem quebrar demais o título. */
export const NOME_MAX = 80;

@Component({
  selector: 'app-campaign-create',
  imports: [FormsModule, RouterModule, Emblema],
  templateUrl: './campaign-create.html',
  styleUrl: './campaign-create.scss',
})
export class CampaignCreate {
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly usuario = this.auth.usuarioLogado;
  readonly sistemas = SISTEMAS;
  readonly nomeMax = NOME_MAX;

  readonly nome = signal('');
  /** Nome de um dos sistemas sugeridos, ou '' quando nenhum foi escolhido. */
  readonly sistemaEscolhido = signal('');
  readonly outroSistema = signal(false);
  readonly sistemaLivre = signal('');

  readonly salvando = signal(false);
  readonly erro = signal('');
  /** 403: conta Jogador ou limite do plano; mostra o link para o perfil. */
  readonly bloqueadoPeloPlano = signal(false);

  readonly sistema = computed(() => (this.outroSistema() ? this.sistemaLivre() : this.sistemaEscolhido()).trim());
  readonly nomeLimpo = computed(() => this.nome().trim());
  readonly podeSalvar = computed(() => !!this.nomeLimpo() && !!this.sistema() && !this.salvando());

  /** Enquanto não há nome, a prévia usa um nome de exemplo para não ficar vazia. */
  readonly nomePrevia = computed(() => this.nomeLimpo() || 'Sua campanha');
  readonly capa = computed(() => capaDoNome(this.nomePrevia()));

  private ultimoSorteio = '';

  escolherSistema(nome: string): void {
    this.outroSistema.set(false);
    this.sistemaEscolhido.set(nome);
  }

  escolherOutro(): void {
    this.outroSistema.set(true);
    this.sistemaEscolhido.set('');
  }

  sortearNome(): void {
    let sorteado = this.ultimoSorteio;
    while (sorteado === this.ultimoSorteio) {
      sorteado = `${INICIOS[Math.floor(Math.random() * INICIOS.length)]} ${LUGARES[Math.floor(Math.random() * LUGARES.length)]}`;
    }
    this.ultimoSorteio = sorteado;
    this.nome.set(sorteado);
  }

  save(): void {
    if (!this.podeSalvar()) return;
    this.salvando.set(true);
    this.erro.set('');
    // Sem mestreId: a API usa o usuário logado como Mestre
    this.campaignService.create({ nome: this.nomeLimpo(), sistema: this.sistema(), ativo: true }).subscribe({
      next: criada => {
        this.salvando.set(false);
        void this.auth.carregarSessao(); // o limite do plano pode ter sido atingido agora
        // Vai direto para a campanha nova, onde ficam o convite e a primeira sessão
        this.router.navigate(criada?.campanhaId ? ['/campaigns', criada.campanhaId] : ['/campaigns']);
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.bloqueadoPeloPlano.set(err.status === 403);
        // a API explica o motivo (ProblemDetails.detail)
        this.erro.set(err.error?.detail || err.error?.message || 'Não foi possível criar a campanha. Tente de novo.');
      },
    });
  }
}
