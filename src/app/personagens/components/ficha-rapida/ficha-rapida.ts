import { Component, computed, inject, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PersonagemService, EstadoParcial } from '../../services/personagem.service';
import { MesaService } from '../../../campaigns/services/mesa.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PlataformaService } from '../../../core/plataforma/plataforma.service';
import { analisarFormula, formulaD20 } from '../../../core/utils/formula-dados';
import { CONDICOES, alternarCondicao, lerCondicoes } from '../../utils/condicoes';
import { alternarMarca, aplicarCura, aplicarDano } from '../../utils/regras-vida';
import { ATRIBUTOS, previaDaAcao } from '../../utils/regras-da-ficha';
import {
  PERICIAS, Pericia, bonusDeAtaque, bonusDeMagia, bonusDePericia, bonusDeSalvaguarda, cdDeMagia, danoDoAtaque, ehConjurador,
  espacosDeMagia, iniciativa, mod, proficienteNaPericia, proficienteNaSalvaguarda, sinal,
} from '../../utils/calculos-da-ficha';

export type AbaRapida = 'acoes' | 'testes' | 'estado';

const CHAVE_ABA = 'wyvern.fichaRapida.aba';

function abaGuardada(): AbaRapida {
  try {
    const salva = localStorage.getItem(CHAVE_ABA);
    if (salva === 'acoes' || salva === 'testes' || salva === 'estado') return salva;
  } catch { /* sem armazenamento: começa em Ações */ }
  return 'acoes';
}

/** O último resultado rolado daqui, para o jogador não precisar abrir a mesa. */
interface Resultado { rotulo: string; formula: string; total: number; natural: 20 | 1 | null }

/**
 * A ficha que o jogador consulta no meio do combate sem sair do mapa: os números que se olha toda hora sempre à
 * vista (PV, CA, iniciativa, deslocamento, condições) e três abas, na ordem em que se usa num turno: o que fazer
 * (ataques, magias e espaços), o que rolar (salvaguardas, perícias, atributos) e como ele está (vida, condições).
 */
@Component({
  selector: 'app-ficha-rapida',
  imports: [RouterLink],
  templateUrl: './ficha-rapida.html',
  styleUrl: './ficha-rapida.scss',
})
export class FichaRapida {
  private personagens = inject(PersonagemService);
  private mesa = inject(MesaService);
  private toast = inject(ToastService);
  private plataforma = inject(PlataformaService);

  readonly personagem = model<any>(null);
  /** No celular o bottom sheet já mostra o nome no título: aqui some o cabeçalho próprio. */
  readonly cabecalho = input(true);

  readonly aba = signal<AbaRapida>(abaGuardada());
  readonly ultimo = signal<Resultado | null>(null);
  /** A magia ou ação aberta para ler a descrição (só uma por vez). */
  readonly aberto = signal<string | null>(null);
  readonly quantidade = signal<number | null>(null);

  readonly condicoesPadrao = CONDICOES;
  readonly sinal = sinal;

  readonly combate = computed(() => this.personagem()?.personagemCombate ?? null);

  readonly vida = computed(() => {
    const c = this.combate();
    const maxima = c?.vidaMaxima ?? 0;
    // "??" e não "||": com 0 PV a ficha tem que mostrar 0, e não a vida máxima
    const atual = c?.vidaAtual ?? maxima;
    const pct = maxima > 0 ? Math.max(0, Math.min(100, Math.round((atual / maxima) * 100))) : 0;
    return { atual, maxima, temporaria: c?.vidaTemporaria ?? 0, pct, baixa: maxima > 0 && pct <= 25, caido: maxima > 0 && atual <= 0 };
  });

  readonly iniciativa = computed(() => iniciativa(this.personagem()));
  readonly condicoes = computed(() => lerCondicoes(this.combate()?.condicoes));

  readonly ataques = computed(() => {
    const p = this.personagem();
    return (p?.personagemAtaques ?? []).map((a: any) => ({
      ataque: a,
      acerto: bonusDeAtaque(p, a),
      dano: danoDoAtaque(p, a),
      detalhe: [a.alcance, a.tipoDano].filter(Boolean).join(' · ') || '—',
    }));
  });

  /** Ações, ações bônus e reações escritas na ficha (traços que não são uma arma). */
  readonly outrasAcoes = computed(() => {
    const p = this.personagem();
    return [
      { titulo: 'Ações', itens: p?.personagemAcoesPadrao ?? [] },
      { titulo: 'Ações bônus', itens: p?.personagemAcoesBonus ?? [] },
      { titulo: 'Reações', itens: p?.personagemReacoes ?? [] },
    ].filter(g => g.itens.length);
  });

  readonly conjurador = computed(() => ehConjurador(this.personagem()));
  readonly cdMagia = computed(() => cdDeMagia(this.personagem()));
  readonly bonusMagia = computed(() => bonusDeMagia(this.personagem()));
  readonly espacos = computed(() => espacosDeMagia(this.personagem()));

  readonly magiasPorCirculo = computed(() => {
    const grupos = new Map<number, any[]>();
    for (const m of this.personagem()?.personagemMagias ?? []) {
      const nivel = m.nivel || 0;
      grupos.set(nivel, [...(grupos.get(nivel) ?? []), m]);
    }
    return [...grupos.entries()].sort(([a], [b]) => a - b)
      .map(([nivel, magias]) => ({ nivel, titulo: nivel === 0 ? 'Truques' : `${nivel}º círculo`, magias }));
  });

  readonly salvaguardas = computed(() => {
    const p = this.personagem();
    return ATRIBUTOS.map(a => ({ ...a, bonus: bonusDeSalvaguarda(p, a.chave), proficiente: proficienteNaSalvaguarda(p, a.chave) }));
  });

  readonly atributos = computed(() => {
    const p = this.personagem();
    return ATRIBUTOS.map(a => ({ ...a, valor: p?.atributo?.[a.chave] ?? null, bonus: mod(p?.atributo?.[a.chave]) }));
  });

  readonly pericias = computed(() => {
    const p = this.personagem();
    return PERICIAS.map(x => ({ ...x, bonus: bonusDePericia(p, x), proficiente: proficienteNaPericia(p, x.nome) }));
  });

  escolherAba(aba: AbaRapida): void {
    this.aba.set(aba);
    try { localStorage.setItem(CHAVE_ABA, aba); } catch { /* fica só nesta visita */ }
  }

  alternarAberto(chave: string): void {
    this.aberto.set(this.aberto() === chave ? null : chave);
  }

  // ---------- rolagens: vão para a mesa, como na ficha completa ----------

  rolarIniciativa(): void { void this.rolar('Iniciativa', formulaD20(this.iniciativa())); }
  rolarAtaque(a: any, acerto: number): void { void this.rolar(`Ataque: ${a.nome}`, formulaD20(acerto)); }
  rolarSalvaguarda(nome: string, bonus: number): void { void this.rolar(`Salvaguarda de ${nome}`, formulaD20(bonus)); }
  rolarAtributo(nome: string, bonus: number): void { void this.rolar(`Teste de ${nome}`, formulaD20(bonus)); }
  rolarPericia(p: Pericia, bonus: number): void { void this.rolar(p.nome, formulaD20(bonus)); }

  rolarDano(a: any, dano: string): void {
    const formula = dano.replace(/\s+/g, '');
    if (!analisarFormula(formula)) {
      this.toast.erro(`O dano de "${a.nome}" (${a.dano || 'vazio'}) não é uma fórmula de dados. Ex.: 1d8+3.`);
      return;
    }
    void this.rolar(`Dano: ${a.nome}`, formula);
  }

  private async rolar(rotulo: string, formula: string): Promise<void> {
    this.plataforma.vibrar('media');
    try {
      const r = await this.mesa.rolar(rotulo, formula, this.personagem()?.nome);
      const d20 = /^1d20([+-]|$)/.test(r.formula) ? r.dados[0] : null;
      this.ultimo.set({ rotulo, formula: r.formula, total: r.total, natural: d20 === 20 || d20 === 1 ? d20 : null });
    } catch {
      this.toast.erro(`Não consegui rolar "${formula}".`);
    }
  }

  // ---------- estado: vida, salvaguardas de morte, condições, espaços ----------

  mudarQuantidade(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.quantidade.set(valor === '' ? null : +valor);
  }

  aplicarDano(): void {
    const n = this.quantidade();
    if (!n || n < 1) return;
    const v = this.vida();
    this.salvar(aplicarDano({ vida: v.atual, maxima: v.maxima, temporarios: v.temporaria }, n));
    this.quantidade.set(null);
  }

  aplicarCura(): void {
    const n = this.quantidade();
    if (!n || n < 1) return;
    const v = this.vida();
    this.salvar(aplicarCura({ vida: v.atual, maxima: v.maxima, temporarios: v.temporaria }, n));
    this.quantidade.set(null);
  }

  ajustarTemporarios(delta: number): void {
    this.salvar({ vidaTemporaria: Math.max(0, this.vida().temporaria + delta) });
  }

  marcarMorte(tipo: 'sucesso' | 'falha', n: number): void {
    const c = this.combate();
    this.salvar(tipo === 'sucesso'
      ? { deathSaveSucessos: alternarMarca(c?.deathSaveSucessos || 0, n) }
      : { deathSaveFalhas: alternarMarca(c?.deathSaveFalhas || 0, n) });
  }

  alternarInspiracao(): void {
    this.salvar({ inspiracaoHeroica: !this.combate()?.inspiracaoHeroica });
  }

  alternarCondicao(nome: string): void {
    this.salvar({ condicoes: alternarCondicao(this.combate()?.condicoes, nome) });
  }

  temCondicao(nome: string): boolean {
    return this.condicoes().includes(nome);
  }

  /** Tocar numa marca cheia gasta a partir dela; numa vazia, recupera até ela (como na ficha completa). */
  alternarEspaco(nivel: number, indice: number): void {
    const p = this.personagem();
    const conjuracao = p?.personagemConjuracao;
    if (!conjuracao) return;
    const atual = conjuracao['slotsNivel' + nivel + 'Atual'] ?? 0;
    const nova = { ...conjuracao, ['slotsNivel' + nivel + 'Atual']: indice < atual ? indice : indice + 1 };
    this.personagem.set({ ...p, personagemConjuracao: nova });
    this.plataforma.vibrar('leve');
    const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => nova['slotsNivel' + n + 'Atual'] ?? 0);
    this.gravar({ espacosAtuais: todos }, 'os espaços de magia');
  }

  marcas(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i);
  }

  previa(acao: any): string {
    return previaDaAcao(acao);
  }

  /** Mostra a mudança na hora e grava; se o servidor recusar, volta ao que está salvo. */
  private salvar(mudanca: EstadoParcial): void {
    const p = this.personagem();
    if (!p?.personagemCombate) return;
    this.personagem.set({ ...p, personagemCombate: { ...p.personagemCombate, ...mudanca } });
    this.gravar(mudanca, 'a alteração');
  }

  private gravar(mudanca: EstadoParcial, oQue: string): void {
    const id = this.personagem()?.personagemId;
    if (!id) return;
    this.personagens.atualizarEstado(id, mudanca).subscribe({
      error: () => {
        this.toast.erro(`Não foi possível salvar ${oQue}. A ficha voltou ao que está gravado.`);
        this.personagens.getById(id).subscribe(atual => this.personagem.set(atual));
      },
    });
  }
}
