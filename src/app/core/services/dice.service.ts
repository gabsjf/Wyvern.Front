import { Injectable } from '@angular/core';
import { analisarFormula, sortearFaces, totalDaRolagem } from '../utils/formula-dados';

/** Quanto esperar os dados 3D assentarem antes de desistir e sortear sem animação. */
const TEMPO_LIMITE_3D = 12000;

export interface ResultadoDados {
  formula: string;
  total: number;
  /** Face que saiu em cada dado, antes do modificador. */
  dados: number[];
}

/**
 * Rolagem de dados para o app inteiro. Mostra os dados 3D na camada global (#dice-box, em app.html) quando dá; quando não
 * dá (sem WebGL, ou o usuário prefere menos movimento), sorteia sem animação. O total é sempre calculado aqui, pelas faces
 * que saíram mais o modificador da fórmula, sem depender do formato de resultado da biblioteca.
 */
@Injectable({ providedIn: 'root' })
export class DiceService {
  private caixa: any = null;
  private iniciando: Promise<void> | undefined;
  private indisponivel = false;
  private limpeza: ReturnType<typeof setTimeout> | undefined;

  /** Rola a fórmula ("1d20+5", "2d6"...). Falha se a fórmula for inválida. */
  async rolar(formula: string): Promise<ResultadoDados> {
    const analisada = analisarFormula(formula);
    if (!analisada) throw new Error(`Fórmula de dados inválida: "${formula}"`);

    const esperados = analisada.termos.reduce((soma, t) => soma + t.quantidade, 0);
    const faces = (await this.rolar3d(formula, esperados)) ?? sortearFaces(analisada);
    return { formula: formula.replace(/\s+/g, ''), total: totalDaRolagem(analisada, faces), dados: faces };
  }

  private async rolar3d(formula: string, esperados: number): Promise<number[] | null> {
    if (this.indisponivel || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

    try {
      await this.garantirCaixa();
      const cor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      // com uma placa de vídeo, os dados assentam em poucos segundos; se passar muito disso, algo travou
      const resultado: any[] = await Promise.race([
        this.caixa.roll(formula, { themeColor: cor }),
        new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo esgotado')), TEMPO_LIMITE_3D)),
      ]);

      clearTimeout(this.limpeza);
      this.limpeza = setTimeout(() => this.caixa?.clear(), 4000);

      // O dice-box devolve uma lista de dados ({ sides, value, ... }); versões com grupos trazem `rolls` dentro de cada grupo.
      const faces = resultado.flatMap(g => Array.isArray(g.rolls) ? g.rolls.map((r: any) => Number(r.value)) : g.sides ? [Number(g.value)] : []);
      // um resultado que não bate com a fórmula não é confiável: melhor sortear do que registrar um total errado
      if (faces.length !== esperados || faces.some(f => !Number.isInteger(f))) throw new Error('resultado 3D incompleto: ' + JSON.stringify(resultado).slice(0, 400));
      return faces;
    } catch (erro) {
      console.warn('Dados 3D indisponíveis; rolando sem animação.', erro);
      this.caixa?.clear?.();
      // só a falha ao iniciar o WebGL desliga os dados 3D; uma rolagem que travou não estraga as próximas
      if (!this.caixa) this.indisponivel = true;
      return null;
    }
  }

  private async garantirCaixa(): Promise<void> {
    if (this.caixa) return;
    this.iniciando ??= (async () => {
      const DiceBox = (await import('@3d-dice/dice-box')).default;
      // O tamanho da área de jogo vem do canvas (ver "#dice-box canvas" em styles.scss).
      const caixa = new DiceBox({
        container: '#dice-box',
        assetPath: '/assets/dice-box/',
        theme: 'default',
        themeColor: '#6464ff',
        scale: 7,
        throwForce: 3,
        startingHeight: 6,
        spinForce: 4,
      });
      await caixa.init();
      this.caixa = caixa;
    })();
    await this.iniciando;
  }
}
