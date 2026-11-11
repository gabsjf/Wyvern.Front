import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PersonagemService } from '../../services/personagem.service';
import { Personagem } from '../../models/personagem';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Emblema } from '../../../shared/ui/emblema/emblema';

/** Um herói da pessoa em outra campanha, pronto para ser trazido. */
interface Candidato {
  personagem: Personagem;
  /** Já existe um herói dela com esse nome na campanha de destino (provavelmente já trouxe). */
  jaTrouxe: boolean;
}

/**
 * Lista os heróis da pessoa que estão em outras campanhas e traz uma cópia para esta.
 * A ficha original continua onde estava; a cópia chega descansada e com o mesmo nível.
 */
@Component({
  selector: 'app-trazer-heroi',
  imports: [Emblema],
  templateUrl: './trazer-heroi.html',
  styleUrl: './trazer-heroi.scss',
})
export class TrazerHeroi implements OnInit {
  private personagens = inject(PersonagemService);
  private toast = inject(ToastService);
  private readonly meuId = inject(AuthService).usuarioLogado()?.usuarioId ?? 0;

  readonly campanhaId = input.required<number>();
  readonly trazido = output<Personagem>();

  readonly candidatos = signal<Candidato[]>([]);
  readonly carregando = signal(true);
  readonly trazendo = signal<number | null>(null);

  ngOnInit() {
    this.personagens.getAll().subscribe({
      next: lista => {
        this.candidatos.set(candidatosPara(lista, this.campanhaId(), this.meuId));
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  resumo(p: Personagem): string {
    const player = p.personagemPlayer;
    const partes = [player?.classe, player?.nivel ? `nível ${player.nivel}` : null].filter(Boolean);
    return partes.join(' · ');
  }

  trazer(c: Candidato) {
    const id = c.personagem.personagemId;
    if (id === undefined || this.trazendo() !== null) return;
    this.trazendo.set(id);
    this.personagens.trazer(id, this.campanhaId()).subscribe({
      next: copia => {
        this.trazendo.set(null);
        this.candidatos.update(lista => lista.map(x => (x === c ? { ...x, jaTrouxe: true } : x)));
        this.toast.ok(`${copia.nome} chegou à campanha.`);
        this.trazido.emit(copia);
      },
      error: (err: HttpErrorResponse) => {
        this.trazendo.set(null);
        this.toast.erro(err.error?.detail || err.error?.message || 'Não foi possível trazer o personagem.');
      },
    });
  }
}

/**
 * Os heróis da pessoa fora da campanha de destino, do mais novo para o mais antigo. Se ela já tem um herói
 * com o mesmo nome no destino, o candidato aparece como "já trazido" (para não criar uma segunda cópia sem querer).
 */
export function candidatosPara(lista: Personagem[], campanhaId: number, meuId: number): Candidato[] {
  const meus = lista.filter(p => p.criadoPorId === meuId && p.tipoId === 1);
  const noDestino = new Set(meus.filter(p => p.campanhaId === campanhaId).map(p => p.nome.trim().toLowerCase()));
  return meus
    .filter(p => p.campanhaId !== campanhaId)
    .sort((a, b) => (b.personagemId ?? 0) - (a.personagemId ?? 0))
    .map(p => ({ personagem: p, jaTrouxe: noDestino.has(p.nome.trim().toLowerCase()) }));
}
