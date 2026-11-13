import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { EscolhasDeNivel, Personagem, ProximoNivel } from '../../models/personagem';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Emblema } from '../../../shared/ui/emblema/emblema';

export const ATRIBUTOS = [
  { chave: 'forca', sigla: 'FOR', nome: 'Força' },
  { chave: 'destreza', sigla: 'DES', nome: 'Destreza' },
  { chave: 'constituicao', sigla: 'CON', nome: 'Constituição' },
  { chave: 'inteligencia', sigla: 'INT', nome: 'Inteligência' },
  { chave: 'sabedoria', sigla: 'SAB', nome: 'Sabedoria' },
  { chave: 'carisma', sigla: 'CAR', nome: 'Carisma' },
] as const;

export const modificador = (valor: number) => Math.floor((valor - 10) / 2);
const comSinal = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

@Component({
  selector: 'app-subir-nivel',
  imports: [FormsModule, RouterModule, Emblema],
  templateUrl: './subir-nivel.html',
  styleUrl: './subir-nivel.scss',
})
export class SubirNivel implements OnInit {
  private personagens = inject(PersonagemService);
  private mesa = inject(MesaService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly atributos = ATRIBUTOS;
  readonly comSinal = comSinal;
  readonly modificador = modificador;

  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly personagem = signal<Personagem | null>(null);
  readonly previa = signal<ProximoNivel | null>(null);
  readonly erroCarga = signal('');

  // ---- escolhas ----
  readonly modoPv = signal<'Fixo' | 'Rolado'>('Fixo');
  /** Resultado do dado de vida. Só se rola uma vez: a regra não permite rolar de novo. */
  readonly rolado = signal<number | null>(null);
  readonly rolando = signal(false);
  readonly subclasse = signal('');
  readonly tipoMelhoria = signal<'Atributos' | 'Talento'>('Atributos');
  readonly talento = signal('');
  readonly aumentos = signal<Record<string, number>>({});

  readonly salvando = signal(false);
  readonly erro = signal('');

  readonly pedeMelhoria = computed(() => !!this.previa() && (this.previa()!.melhoriaDeAtributo || this.previa()!.dadivaEpica));
  /** Até onde um atributo pode chegar com a escolha atual (Dádiva Épica com talento vai a 30). */
  readonly teto = computed(() => (this.previa()?.dadivaEpica && this.tipoMelhoria() === 'Talento' ? 30 : 20));
  readonly somaAumentos = computed(() => Object.values(this.aumentos()).reduce((a, b) => a + b, 0));
  readonly limiteAumentos = computed(() => (this.tipoMelhoria() === 'Atributos' ? 2 : 1));

  readonly conAntes = computed(() => modificador(this.previa()?.atributos['constituicao'] ?? 10));
  readonly conDepois = computed(() => modificador((this.previa()?.atributos['constituicao'] ?? 10) + (this.aumentos()['constituicao'] ?? 0)));

  /** Mesma conta do servidor: PV do nível com a CON antiga (mínimo 1) + 1 por nível se a CON subiu. */
  readonly pvGanhos = computed(() => {
    const p = this.previa();
    if (!p) return null;
    const base = this.modoPv() === 'Fixo' ? p.pvFixo : this.rolado();
    if (base == null) return null;
    return Math.max(1, base + this.conAntes()) + (this.conDepois() - this.conAntes()) * p.proximoNivel;
  });

  readonly pendencias = computed(() => {
    const p = this.previa();
    if (!p) return ['carregando'];
    const faltam: string[] = [];
    if (this.modoPv() === 'Rolado' && this.rolado() == null) faltam.push('rolar o dado de vida');
    if (p.escolheSubclasse && p.proximoNivel === 3 && !this.subclasse().trim()) faltam.push('escolher a subclasse');
    if (this.pedeMelhoria()) {
      if (this.tipoMelhoria() === 'Atributos' && this.somaAumentos() !== 2) faltam.push('distribuir os 2 pontos de atributo');
      if (this.tipoMelhoria() === 'Talento' && !this.talento().trim()) faltam.push('dizer qual talento');
    }
    return faltam;
  });

  readonly podeConfirmar = computed(() => !!this.previa()?.podeSubir && this.pendencias().length === 0 && !this.salvando());

  readonly espacos = computed(() => {
    const p = this.previa();
    if (!p?.espacosDepois) return [];
    return p.espacosDepois
      .map((depois, i) => ({ circulo: i + 1, antes: p.espacosAntes?.[i] ?? 0, depois }))
      .filter(e => e.antes > 0 || e.depois > 0);
  });

  ngOnInit(): void {
    this.personagens.getById(this.id).subscribe({
      next: p => this.personagem.set(p),
      error: () => this.erroCarga.set('Não foi possível abrir esta ficha.'),
    });
    this.personagens.proximoNivel(this.id).subscribe({
      next: p => this.previa.set(p),
      error: () => this.erroCarga.set('Não foi possível calcular o próximo nível.'),
    });
  }

  escolherModo(modo: 'Fixo' | 'Rolado'): void {
    // Depois de rolar, o resultado vale: não dá para trocar pelo fixo nem rolar de novo
    if (this.rolado() != null) return;
    this.modoPv.set(modo);
  }

  async rolarDado(): Promise<void> {
    const p = this.previa();
    if (!p || this.rolado() != null || this.rolando()) return;
    this.modoPv.set('Rolado');
    this.rolando.set(true);
    try {
      const r = await this.mesa.rolar(`Dado de vida (nível ${p.proximoNivel})`, `1d${p.dadoVida}`, this.personagem()?.nome);
      this.rolado.set(Math.min(p.dadoVida, Math.max(1, r.total)));
    } catch {
      this.toast.erro('Não consegui rolar o dado. Tente de novo.');
    } finally {
      this.rolando.set(false);
    }
  }

  escolherMelhoria(tipo: 'Atributos' | 'Talento'): void {
    this.tipoMelhoria.set(tipo);
    this.aumentos.set({});
  }

  valorDepois(chave: string): number {
    return (this.previa()?.atributos[chave] ?? 10) + (this.aumentos()[chave] ?? 0);
  }

  podeAumentar(chave: string): boolean {
    const atual = this.aumentos()[chave] ?? 0;
    const maxPorAtributo = this.tipoMelhoria() === 'Atributos' ? 2 : 1;
    return this.somaAumentos() < this.limiteAumentos() && atual < maxPorAtributo && this.valorDepois(chave) < this.teto();
  }

  ajustar(chave: string, delta: 1 | -1): void {
    const atual = this.aumentos()[chave] ?? 0;
    if (delta > 0 && !this.podeAumentar(chave)) return;
    if (delta < 0 && atual <= 0) return;
    const novo = { ...this.aumentos(), [chave]: atual + delta };
    if (novo[chave] === 0) delete novo[chave];
    this.aumentos.set(novo);
  }

  confirmar(): void {
    const p = this.previa();
    if (!p || !this.podeConfirmar()) return;
    this.salvando.set(true);
    this.erro.set('');

    const escolhas: EscolhasDeNivel = { modoPv: this.modoPv() };
    if (this.modoPv() === 'Rolado') escolhas.pvRolado = this.rolado()!;
    if (p.escolheSubclasse && this.subclasse().trim()) escolhas.subclasse = this.subclasse().trim();
    if (this.pedeMelhoria()) {
      escolhas.melhoria = {
        tipo: this.tipoMelhoria(),
        talento: this.tipoMelhoria() === 'Talento' ? this.talento().trim() : undefined,
        aumentos: this.aumentos(),
      };
    }

    this.personagens.subirNivel(this.id, escolhas).subscribe({
      next: r => {
        this.salvando.set(false);
        this.toast.ok(`${this.personagem()?.nome ?? 'O personagem'} chegou ao nível ${r.nivelNovo} (+${r.pvGanhos} PV).`);
        this.router.navigate(['/ficha', this.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.erro.set(err.error?.detail || err.error?.message || 'Não foi possível subir de nível. Tente de novo.');
      },
    });
  }
}
