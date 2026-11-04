import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, inject, signal, viewChild, AfterViewInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { PersonagemService } from '../../services/personagem.service';
import {
  Rolagem, ResultadoDescanso, curaTotal, dadosDeVida, modConstituicao, resultadoCurto, resultadoLongo, rolarDadosDeVida, temEspacosDeMagia,
} from '../../utils/regras-descanso';

export type TipoDescanso = 'curto' | 'longo';

/**
 * Diálogo de descanso curto ou longo. Duas formas de chegar ao resultado:
 *  - sistema: rola os dados de vida (curto) ou aplica as regras (longo);
 *  - manual: o jogador rolou dados físicos e digita o que saiu (curto) ou ajusta cada valor (longo).
 */
@Component({
  selector: 'app-descanso-dialog',
  imports: [FormsModule],
  templateUrl: './descanso-dialog.html',
  styleUrl: './descanso-dialog.scss',
})
export class DescansoDialog implements OnInit, AfterViewInit {
  private personagens = inject(PersonagemService);
  private caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  @Input({ required: true }) personagem: any;
  @Input({ required: true }) tipo: TipoDescanso = 'curto';
  @Output() fechar = new EventEmitter<void>();
  /** Emite um resumo curto do que foi feito, para a ficha avisar o usuário. */
  @Output() concluido = new EventEmitter<string>();

  modo: 'sistema' | 'manual' = 'sistema';
  salvando = signal(false);
  erroServidor = signal('');

  // ficha antes do descanso
  vidaMaxima = 0;
  vidaAtual = 0;
  vidaTemporaria = 0;
  dados = { faces: 0, total: 0, gasto: 0, disponiveis: 0 };
  modCon = 0;
  temEspacos = false;

  // descanso curto
  quantidade = 0;
  rolagens: Rolagem[] | null = null;
  curaManual: number | null = null;
  restaurarEspacosCurto = false;

  // descanso longo: valores propostos pelas regras, editáveis no modo manual
  longo!: ResultadoDescanso;

  ngOnInit() {
    const combate = this.personagem?.personagemCombate ?? {};
    this.vidaMaxima = combate.vidaMaxima ?? 0;
    this.vidaAtual = combate.vidaAtual ?? this.vidaMaxima;
    this.vidaTemporaria = combate.vidaTemporaria ?? 0;
    this.dados = dadosDeVida(this.personagem);
    this.modCon = modConstituicao(this.personagem);
    this.temEspacos = temEspacosDeMagia(this.personagem);

    // ao abrir, já propõe gastar 1 dado se faz sentido (machucado, com dado para gastar e faces conhecidas)
    this.quantidade = this.vidaAtual < this.vidaMaxima && this.dados.disponiveis > 0 && this.dados.faces > 0 ? 1 : 0;
    this.longo = resultadoLongo(this.personagem);
  }

  ngAfterViewInit() {
    this.caixa()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  aoEscape() {
    if (!this.salvando()) this.fechar.emit();
  }

  get ehCurto(): boolean {
    return this.tipo === 'curto';
  }

  get nomePersonagem(): string {
    return this.personagem?.nome ?? '';
  }

  get modConTexto(): string {
    return this.modCon >= 0 ? `+${this.modCon}` : `${this.modCon}`;
  }

  trocarModo(modo: 'sistema' | 'manual') {
    this.modo = modo;
    this.erroServidor.set('');
    if (modo === 'sistema') {
      // voltar ao automático descarta o que foi digitado à mão
      this.longo = resultadoLongo(this.personagem);
      this.curaManual = null;
    } else {
      this.rolagens = null;
    }
  }

  // ----- descanso curto -----
  get podeRolar(): boolean {
    return this.dados.faces > 0;
  }

  ajustarQuantidade(passo: number) {
    if (this.rolagens) return; // depois de rolar, a quantidade fica travada
    this.quantidade = Math.min(this.dados.disponiveis, Math.max(0, this.quantidade + passo));
  }

  rolar() {
    if (!this.podeRolar || this.quantidade < 1 || this.rolagens) return;
    this.rolagens = rolarDadosDeVida(this.quantidade, this.dados.faces, this.modCon);
  }

  descartarRolagem() {
    this.rolagens = null;
  }

  get cura(): number {
    return this.modo === 'sistema' ? curaTotal(this.rolagens ?? []) : Math.max(0, Math.floor(this.curaManual ?? 0));
  }

  get vidaDepois(): number {
    return Math.min(this.vidaMaxima, this.vidaAtual + this.cura);
  }

  /** Os dados só contam como gastos depois de rolados (modo sistema) ou, no manual, pela quantidade informada. */
  get dadosGastosCurto(): number {
    return this.modo === 'sistema' ? (this.rolagens?.length ?? 0) : this.quantidade;
  }

  get curtoValido(): boolean {
    if (this.modo === 'sistema') return true; // sem rolar nada, o descanso só passa o tempo
    return this.curaManual === null || (Number.isFinite(this.curaManual) && this.curaManual >= 0);
  }

  // ----- descanso longo -----
  get longoErro(): string {
    const r = this.longo;
    if (!Number.isFinite(r.vidaAtual) || r.vidaAtual < 0 || r.vidaAtual > this.vidaMaxima) return `Os PV devem ficar entre 0 e ${this.vidaMaxima}.`;
    if (!Number.isFinite(r.dadoVidaGasto) || r.dadoVidaGasto < 0 || r.dadoVidaGasto > this.dados.total) return `Os dados de vida gastos devem ficar entre 0 e ${this.dados.total}.`;
    if (!Number.isFinite(r.vidaTemporaria) || r.vidaTemporaria < 0) return 'Os PV temporários não podem ser negativos.';
    return '';
  }

  get zerarSalvaguardas(): boolean {
    return this.longo.deathSaveSucessos === 0 && this.longo.deathSaveFalhas === 0;
  }

  set zerarSalvaguardas(zerar: boolean) {
    const combate = this.personagem?.personagemCombate ?? {};
    this.longo.deathSaveSucessos = zerar ? 0 : combate.deathSaveSucessos ?? 0;
    this.longo.deathSaveFalhas = zerar ? 0 : combate.deathSaveFalhas ?? 0;
  }

  get dadosRecuperados(): number {
    return Math.max(0, this.dados.gasto - this.longo.dadoVidaGasto);
  }

  // ----- aplicar -----
  get podeAplicar(): boolean {
    if (this.salvando()) return false;
    return this.ehCurto ? this.curtoValido : this.longoErro === '';
  }

  aplicar() {
    if (!this.podeAplicar) return;

    const resultado: ResultadoDescanso = this.ehCurto
      ? resultadoCurto(this.personagem, this.dadosGastosCurto, this.cura, this.restaurarEspacosCurto)
      : { ...this.longo, tipo: 'Longo' };

    this.salvando.set(true);
    this.erroServidor.set('');
    this.personagens.registrarDescanso(this.personagem.personagemId, resultado).subscribe({
      next: () => {
        this.salvando.set(false);
        this.concluido.emit(this.resumo(resultado));
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.erroServidor.set(this.mensagemDeErro(err));
      },
    });
  }

  /** A mensagem do servidor, quando há; senão uma explicação pelo tipo de falha. */
  private mensagemDeErro(err: HttpErrorResponse): string {
    const doServidor = err.error?.detail || (typeof err.error === 'string' && err.error);
    if (doServidor) return doServidor;

    switch (err.status) {
      case 0: return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
      case 401: return 'Sua sessão expirou. Entre de novo e tente outra vez.';
      case 403: return 'Você não tem permissão para registrar o descanso deste personagem.';
      case 404: return 'O servidor não encontrou este personagem ou ainda não tem a função de descanso. Se o sistema acabou de ser atualizado, reinicie a API.';
      default: return 'Não foi possível registrar o descanso. Tente de novo.';
    }
  }

  private resumo(r: ResultadoDescanso): string {
    const delta = r.vidaAtual - this.vidaAtual;
    const pv = delta > 0 ? `+${delta} PV` : 'sem mudança nos PV';
    if (r.tipo === 'Curto') {
      const n = this.dadosGastosCurto;
      return `Descanso curto de ${this.nomePersonagem}: ${pv}${n ? `, ${n} ${n === 1 ? 'dado de vida gasto' : 'dados de vida gastos'}` : ''}.`;
    }
    return `Descanso longo de ${this.nomePersonagem}: ${pv}${this.dadosRecuperados ? `, ${this.dadosRecuperados} ${this.dadosRecuperados === 1 ? 'dado de vida recuperado' : 'dados de vida recuperados'}` : ''}.`;
  }
}
