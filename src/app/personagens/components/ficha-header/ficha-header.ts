import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersonagemService, EstadoParcial } from '../../services/personagem.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PedidoDeTeste } from '../ficha-atributos/ficha-atributos';
import { alternarMarca, aplicarCura, aplicarDano } from '../../utils/regras-vida';

@Component({
  selector: 'app-ficha-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ficha-header.html',
  styleUrls: ['./ficha-header.scss']
})
export class FichaHeader implements AfterViewInit, OnDestroy {
  private personagens = inject(PersonagemService);
  private toast = inject(ToastService);

  /** O bloco de PV saiu da tela ao rolar: no celular aparece a faixa fixa com PV, CA e Iniciativa. */
  readonly encolhido = signal(false);
  private bloco = viewChild<ElementRef<HTMLElement>>('bloco');
  private observador?: IntersectionObserver;

  ngAfterViewInit() {
    const bloco = this.bloco()?.nativeElement;
    if (!bloco || typeof IntersectionObserver === 'undefined') return;
    // a faixa entra quando o fim do cartão de vida passa da borda de cima
    this.observador = new IntersectionObserver(([e]) => {
      const encolhido = !e.isIntersecting && e.boundingClientRect.top < 0;
      this.encolhido.set(encolhido);
      // as abas da ficha (presas no topo) descem a altura da faixa
      document.documentElement.style.setProperty('--ficha-faixa', encolhido && this.combate ? '46px' : '0px');
    }, { rootMargin: '-56px 0px 0px 0px' });
    this.observador.observe(bloco);
  }

  ngOnDestroy() {
    this.observador?.disconnect();
    document.documentElement.style.removeProperty('--ficha-faixa');
  }

  @Input() personagem: any;
  /** Clicar na iniciativa pede a rolagem de um d20 com o bônus dela. */
  @Output() rolar = new EventEmitter<PedidoDeTeste>();
  /** Pede à ficha para recarregar do servidor (quando uma alteração falha, para voltar ao valor real). */
  @Output() recarregar = new EventEmitter<void>();

  /** Quantidade digitada para dano ou cura. */
  quantidade: number | null = null;

  get combate(): any {
    return this.personagem?.personagemCombate;
  }

  getIniciativaBonus(): number {
    const ini = this.combate?.iniciativa;
    if (ini) return ini;
    const destreza = this.personagem?.atributo?.destreza;
    return destreza ? Math.floor((destreza - 10) / 2) : 0;
  }

  getIniciativaStr(): string {
    const ini = this.getIniciativaBonus();
    return ini >= 0 ? `+${ini}` : `${ini}`;
  }

  getProficienciaStr(): string {
    const pb = this.personagem?.personagemCombate?.proficienciaBonus || 0;
    return pb >= 0 ? `+${pb}` : `${pb}`;
  }

  get vidaMaxima(): number {
    return this.personagem?.personagemCombate?.vidaMaxima ?? 0;
  }

  // "??" e não "||": com 0 PV a ficha tem que mostrar 0, e não a vida máxima.
  get vidaAtual(): number {
    return this.personagem?.personagemCombate?.vidaAtual ?? this.vidaMaxima;
  }

  get vidaTemporaria(): number {
    return this.combate?.vidaTemporaria ?? 0;
  }

  get vidaPct(): number {
    if (this.vidaMaxima <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((this.vidaAtual / this.vidaMaxima) * 100)));
  }

  get vidaBaixa(): boolean {
    return this.vidaPct <= 25;
  }

  get sucessosMorte(): number {
    return this.personagem?.personagemCombate?.deathSaveSucessos || 0;
  }

  get falhasMorte(): number {
    return this.personagem?.personagemCombate?.deathSaveFalhas || 0;
  }

  get dadoVida(): string {
    return this.personagem?.personagemCombate?.dadoVidaMaximo || '—';
  }

  get inspiracao(): boolean {
    return !!this.combate?.inspiracaoHeroica;
  }

  // ----- ações -----
  rolarIniciativa() {
    this.rolar.emit({ rotulo: 'Iniciativa', bonus: this.getIniciativaBonus() });
  }

  aplicarDano() {
    const n = this.quantidade;
    if (!n || n < 1) return;
    this.salvar(aplicarDano({ vida: this.vidaAtual, maxima: this.vidaMaxima, temporarios: this.vidaTemporaria }, n));
    this.quantidade = null;
  }

  aplicarCura() {
    const n = this.quantidade;
    if (!n || n < 1) return;
    this.salvar(aplicarCura({ vida: this.vidaAtual, maxima: this.vidaMaxima, temporarios: this.vidaTemporaria }, n));
    this.quantidade = null;
  }

  ajustarTemporarios(delta: number) {
    this.salvar({ vidaTemporaria: Math.max(0, this.vidaTemporaria + delta) });
  }

  marcarSalvaguarda(tipo: 'sucesso' | 'falha', n: number) {
    this.salvar(tipo === 'sucesso'
      ? { deathSaveSucessos: alternarMarca(this.sucessosMorte, n) }
      : { deathSaveFalhas: alternarMarca(this.falhasMorte, n) });
  }

  alternarInspiracao() {
    this.salvar({ inspiracaoHeroica: !this.inspiracao });
  }

  /** Mostra a mudança na hora e a grava; se o servidor recusar, volta ao que está salvo. */
  private salvar(mudanca: EstadoParcial) {
    if (!this.combate) return;
    Object.assign(this.combate, mudanca);
    this.personagens.atualizarEstado(this.personagem.personagemId, mudanca).subscribe({
      error: () => {
        this.toast.erro('Não foi possível salvar a alteração. A ficha voltou ao que está gravado.');
        this.recarregar.emit();
      },
    });
  }
}
