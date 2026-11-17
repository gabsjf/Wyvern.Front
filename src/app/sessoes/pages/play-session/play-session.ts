import { Component, DestroyRef, OnInit, inject, ChangeDetectorRef, computed, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';
import { CombateTracker } from '../combate-tracker/combate-tracker';
import { Anotacoes } from './anotacoes/anotacoes';
import { MapaTatico } from '../mapa-tatico/mapa-tatico';
import { LayoutService } from '../../../core/layout/layout.service';
import { PlataformaService } from '../../../core/plataforma/plataforma.service';
import { AuthService } from '../../../core/services/auth.service';
import { MesaAoVivo } from '../../../campaigns/components/mesa-ao-vivo/mesa-ao-vivo';
import { PapelService } from '../../../campaigns/services/papel.service';
import { PersonagemService } from '../../../personagens/services/personagem.service';
import { FichaRapida } from '../../../personagens/components/ficha-rapida/ficha-rapida';
import { BottomSheet } from '../../../shared/ui/bottom-sheet/bottom-sheet';
import { Camada } from '../../../shared/ui/camada.directive';
import { CombateService } from '../../services/combate.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { firstValueFrom } from 'rxjs';

type Aba = 'combate' | 'mapa' | 'anotacoes';

@Component({
  selector: 'app-play-session',
  imports: [CommonModule, RouterLink, CombateTracker, Anotacoes, MapaTatico, MesaAoVivo, FichaRapida, BottomSheet, Camada],
  host: { '(document:keydown)': 'aoTeclar($event)' },
  templateUrl: './play-session.html',
  styleUrl: './play-session.scss'
})
export class PlaySession implements OnInit {
  private route = inject(ActivatedRoute);
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  private layout = inject(LayoutService);
  protected plataforma = inject(PlataformaService);
  private papeis = inject(PapelService);
  private personagens = inject(PersonagemService);
  private auth = inject(AuthService);
  private combates = inject(CombateService);
  private toast = inject(ToastService);
  private pararDeObservar: (() => void) | null = null;
  private destroyRef = inject(DestroyRef);

  sessaoId!: number;
  sessao: Sessao | null = null;
  activeTab: Aba = 'combate';
  /** O herói do Jogador nesta campanha: o resumo dele fica no topo e a ficha rápida abre sem sair da mesa. */
  readonly minhaFichaId = signal<number | null>(null);
  readonly meuHeroi = signal<any>(null);
  readonly fichaAberta = signal(false);
  /** É a vez do meu herói no combate da sessão: o chip do topo acende, em qualquer aba. */
  readonly minhaVez = signal(false);
  readonly resumoDoHeroi = computed(() => {
    const c = this.meuHeroi()?.personagemCombate;
    if (!c) return null;
    const maxima = c.vidaMaxima ?? 0;
    const atual = c.vidaAtual ?? maxima;
    return { atual, maxima, ca: c.classeArmadura || 10, baixa: maxima > 0 && atual <= maxima / 4 };
  });
  protected readonly mesa = viewChild(MesaAoVivo);
  private soltarPaisagem: (() => void) | null = null;

  constructor() {
    // A mesa ocupa a tela toda: some a barra do app enquanto ela estiver aberta
    this.layout.imersivo.set(true);
    this.destroyRef.onDestroy(() => {
      this.layout.imersivo.set(false);
      this.soltarPaisagem?.();
      this.pararDeObservar?.();
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.sessaoId = +id;
        this.carregarSessao();
      }
    });
  }

  carregarSessao() {
    this.sessaoService.getById(this.sessaoId).subscribe({
      next: (s) => {
        this.sessao = s;
        this.cdr.detectChanges();
        this.buscarMinhaFicha(s.campanhaId);
      },
      error: (err) => {
        console.error('Erro ao carregar sessão', err);
        this.cdr.detectChanges();
      }
    });
  }

  setTab(tab: Aba) {
    if (tab !== this.activeTab) this.plataforma.vibrar('leve');
    this.activeTab = tab;
    // O mapa aproveita o celular deitado; as outras abas ficam em pé.
    if (tab === 'mapa' && !this.soltarPaisagem) {
      this.soltarPaisagem = this.plataforma.pedirPaisagem();
    } else if (tab !== 'mapa' && this.soltarPaisagem) {
      this.soltarPaisagem();
      this.soltarPaisagem = null;
    }
  }

  /** A ficha rápida: painel ao lado no computador, bottom sheet no celular. Ao abrir, busca a ficha de novo. */
  alternarFicha() {
    const abrir = !this.fichaAberta();
    this.fichaAberta.set(abrir);
    this.plataforma.vibrar('leve');
    if (abrir) this.carregarHeroi();
  }

  /** "F" abre e fecha a ficha rápida (fora de campos de texto). */
  aoTeclar(evento: KeyboardEvent) {
    if (evento.key?.toLowerCase() !== 'f' || evento.ctrlKey || evento.metaKey || evento.altKey || !this.minhaFichaId()) return;
    const alvo = evento.target as HTMLElement | null;
    if (alvo?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    evento.preventDefault();
    this.alternarFicha();
  }

  /**
   * Dano, cura ou condição que o Mestre marca no combate chega na hora ao resumo e à ficha rápida; e, quando a vez
   * chega ao herói, o chip acende e o celular vibra, esteja o jogador no mapa, no combate ou nas anotações.
   */
  private async observarMeuHeroi() {
    if (this.pararDeObservar) return;
    void this.conferirMinhaVez();
    const parar = await this.combates.observarSessao(this.sessaoId, {
      personagem: id => { if (id === this.minhaFichaId()) this.carregarHeroi(); },
      vez: () => void this.conferirMinhaVez(),
    });
    if (this.destroyRef.destroyed) parar();
    else this.pararDeObservar = parar;
  }

  private async conferirMinhaVez() {
    try {
      const combate = await firstValueFrom(this.combates.getActiveCombatBySessao(this.sessaoId));
      const atual = combate?.participantes?.[combate.turnoAtualIndex];
      const agora = !!atual && atual.personagemId === this.minhaFichaId();
      // o aviso forte fica no rastreador (aba Combate); fora dele, vibra aqui
      if (agora && !this.minhaVez() && this.activeTab !== 'combate') {
        this.plataforma.vibrar('forte');
        this.toast.info(`Sua vez: ${atual.nomeNPC}!`);
      }
      this.minhaVez.set(agora);
    } catch { /* sem combate ou sem rede: o chip fica como estava */ }
  }

  private carregarHeroi() {
    const id = this.minhaFichaId();
    if (id) this.personagens.getById(id).subscribe(p => this.meuHeroi.set(p));
  }

  abrirDados() {
    this.plataforma.vibrar('leve');
    this.mesa()?.alternar();
  }

  private buscarMinhaFicha(campanhaId: number) {
    this.papeis.papelNaCampanha(campanhaId).subscribe(papel => {
      if (papel !== 'Jogador') return;
      const eu = this.auth.usuarioLogado()?.usuarioId;
      this.personagens.getAll().subscribe(lista => {
        const heroi = lista.find(p => p.tipoId === 1 && p.campanhaId === campanhaId && (!eu || p.criadoPorId === eu));
        this.minhaFichaId.set(heroi?.personagemId ?? null);
        this.carregarHeroi();
        if (heroi) void this.observarMeuHeroi();
      });
    });
  }
}
