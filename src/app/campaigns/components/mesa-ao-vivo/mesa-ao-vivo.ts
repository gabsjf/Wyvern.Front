import { Component, DestroyRef, Input, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { MesaService, RolagemMesa } from '../../services/mesa.service';
import { Emblema } from '../../../shared/ui/emblema/emblema';
import { BottomSheet } from '../../../shared/ui/bottom-sheet/bottom-sheet';
import { PlataformaService } from '../../../core/plataforma/plataforma.service';

/**
 * Botão flutuante da mesa ao vivo: mostra, em tempo real, o que a campanha inteira está rolando.
 * Quando alguém rola e o painel está fechado, o resultado aparece por alguns segundos.
 */
@Component({
  selector: 'app-mesa-ao-vivo',
  imports: [DatePipe, NgTemplateOutlet, Emblema, BottomSheet],
  host: { '[class.sem-botao]': '!botaoNoCelular()' },
  templateUrl: './mesa-ao-vivo.html',
  styleUrl: './mesa-ao-vivo.scss',
})
export class MesaAoVivo implements OnInit {
  protected mesa = inject(MesaService);
  private destroyRef = inject(DestroyRef);

  @Input({ required: true }) campanhaId!: number;
  /** No celular, false esconde o botão flutuante: a tela abre a mesa por conta própria (ex.: aba "Dados" da sessão). */
  readonly botaoNoCelular = input(true);
  protected plataforma = inject(PlataformaService);

  aberta = signal(false);
  aviso = signal<RolagemMesa | null>(null);
  private vistas = signal(0);
  private ultimoId: string | undefined;
  private pronta = false;
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  /** Da mais recente para a mais antiga. */
  recentes = computed(() => [...this.mesa.rolagens()].reverse());
  naoVistas = computed(() => Math.max(0, this.mesa.rolagens().length - this.vistas()));

  constructor() {
    effect(() => {
      const lista = this.mesa.rolagens();
      const ultima = lista.at(-1);
      untracked(() => {
        if (!this.pronta || !ultima || ultima.id === this.ultimoId) return;
        this.ultimoId = ultima.id;
        this.plataforma.vibrar(this.natural(ultima) === 20 ? 'sucesso' : 'leve');
        if (this.aberta()) {
          this.vistas.set(lista.length);
        } else {
          this.aviso.set(ultima);
          clearTimeout(this.temporizador);
          this.temporizador = setTimeout(() => this.aviso.set(null), 6000);
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.temporizador);
      void this.mesa.sair();
    });
  }

  async ngOnInit() {
    await this.mesa.entrar(this.campanhaId);
    // o que já estava no histórico ao entrar não conta como novidade
    this.ultimoId = this.mesa.rolagens().at(-1)?.id;
    this.vistas.set(this.mesa.rolagens().length);
    this.pronta = true;
  }

  alternar() {
    this.aberta.update(a => !a);
    if (this.aberta()) {
      this.aviso.set(null);
      this.vistas.set(this.mesa.rolagens().length);
    }
  }

  /** Um único d20 que deu 20 (crítico) ou 1 (falha crítica). */
  natural(r: RolagemMesa): 20 | 1 | null {
    if (r.dados.length !== 1 || !r.formula.toLowerCase().startsWith('1d20')) return null;
    return r.dados[0] === 20 ? 20 : r.dados[0] === 1 ? 1 : null;
  }

  quem(r: RolagemMesa): string {
    return r.personagem || r.usuario;
  }

  detalhe(r: RolagemMesa): string {
    return `${r.formula} (${r.dados.join(' + ')})`;
  }
}
