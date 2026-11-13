/**
 * O que cada tipo de personagem precisa ter para ser criado, pelas regras do D&D 2024.
 * Espelha o RegrasDaFicha da API (que recusa a criação com o mesmo critério):
 *  - Herói: classe, espécie, antecedente, nível 1–20, os seis atributos, PV, CA e deslocamento; subclasse a partir do nível 3.
 *  - NPC narrativo: só o nome.
 *  - NPC de combate, vilão e monstro: o bloco de estatísticas (tamanho, tipo de criatura, ND, atributos, PV, CA, deslocamento).
 * Vale só ao criar: fichas antigas continuam editáveis do jeito que estão.
 */

export type AbaDaFicha = 'basico' | 'atributos' | 'detalhes' | 'acoes';

export interface Falta {
  campo: string;
  aba: AbaDaFicha;
  mensagem: string;
}

export const HEROI = 1, NPC = 2, MONSTRO = 3;

export const CATEGORIAS_NPC = [
  { valor: 'Narrativo', nome: 'Narrativo', descricao: 'Fala, ajuda, atrapalha; não entra em combate' },
  { valor: 'Inimigo', nome: 'De combate', descricao: 'Luta ao lado ou contra o grupo' },
  { valor: 'Vilao', nome: 'Vilão', descricao: 'O antagonista da história, com ficha de combate' },
];

/** XP por nível de desafio (Livro dos Monstros). */
export const XP_POR_ND: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900,
  '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000,
  '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

export const NDS = Object.keys(XP_POR_ND);

export type Atributo = 'forca' | 'destreza' | 'constituicao' | 'inteligencia' | 'sabedoria' | 'carisma';

export const ATRIBUTOS: { chave: Atributo; sigla: string; nome: string; save: string }[] = [
  { chave: 'forca', sigla: 'FOR', nome: 'Força', save: 'proficienciaSalvaguardaForca' },
  { chave: 'destreza', sigla: 'DES', nome: 'Destreza', save: 'proficienciaSalvaguardaDestreza' },
  { chave: 'constituicao', sigla: 'CON', nome: 'Constituição', save: 'proficienciaSalvaguardaConstituicao' },
  { chave: 'inteligencia', sigla: 'INT', nome: 'Inteligência', save: 'proficienciaSalvaguardaInteligencia' },
  { chave: 'sabedoria', sigla: 'SAB', nome: 'Sabedoria', save: 'proficienciaSalvaguardaSabedoria' },
  { chave: 'carisma', sigla: 'CAR', nome: 'Carisma', save: 'proficienciaSalvaguardaCarisma' },
];

export interface ClasseDnd {
  nome: string;
  dadoVida: number;
  /** Salvaguardas em que a classe é proficiente. */
  salvaguardas: Atributo[];
  /** Ordem sugerida para o arranjo padrão (do mais ao menos importante). */
  prioridade: Atributo[];
  conjuracao: 'Nenhum' | 'Inteligencia' | 'Sabedoria' | 'Carisma';
}

export const CLASSES: ClasseDnd[] = [
  { nome: 'Bárbaro', dadoVida: 12, salvaguardas: ['forca', 'constituicao'], prioridade: ['forca', 'constituicao', 'destreza', 'sabedoria', 'carisma', 'inteligencia'], conjuracao: 'Nenhum' },
  { nome: 'Bardo', dadoVida: 8, salvaguardas: ['destreza', 'carisma'], prioridade: ['carisma', 'destreza', 'constituicao', 'sabedoria', 'inteligencia', 'forca'], conjuracao: 'Carisma' },
  { nome: 'Bruxo', dadoVida: 8, salvaguardas: ['sabedoria', 'carisma'], prioridade: ['carisma', 'constituicao', 'destreza', 'sabedoria', 'inteligencia', 'forca'], conjuracao: 'Carisma' },
  { nome: 'Clérigo', dadoVida: 8, salvaguardas: ['sabedoria', 'carisma'], prioridade: ['sabedoria', 'constituicao', 'forca', 'carisma', 'inteligencia', 'destreza'], conjuracao: 'Sabedoria' },
  { nome: 'Druida', dadoVida: 8, salvaguardas: ['inteligencia', 'sabedoria'], prioridade: ['sabedoria', 'constituicao', 'destreza', 'inteligencia', 'carisma', 'forca'], conjuracao: 'Sabedoria' },
  { nome: 'Feiticeiro', dadoVida: 6, salvaguardas: ['constituicao', 'carisma'], prioridade: ['carisma', 'constituicao', 'destreza', 'sabedoria', 'inteligencia', 'forca'], conjuracao: 'Carisma' },
  { nome: 'Guerreiro', dadoVida: 10, salvaguardas: ['forca', 'constituicao'], prioridade: ['forca', 'constituicao', 'destreza', 'sabedoria', 'carisma', 'inteligencia'], conjuracao: 'Nenhum' },
  { nome: 'Ladino', dadoVida: 8, salvaguardas: ['destreza', 'inteligencia'], prioridade: ['destreza', 'constituicao', 'inteligencia', 'sabedoria', 'carisma', 'forca'], conjuracao: 'Nenhum' },
  { nome: 'Mago', dadoVida: 6, salvaguardas: ['inteligencia', 'sabedoria'], prioridade: ['inteligencia', 'constituicao', 'destreza', 'sabedoria', 'carisma', 'forca'], conjuracao: 'Inteligencia' },
  { nome: 'Monge', dadoVida: 8, salvaguardas: ['forca', 'destreza'], prioridade: ['destreza', 'sabedoria', 'constituicao', 'forca', 'inteligencia', 'carisma'], conjuracao: 'Nenhum' },
  { nome: 'Paladino', dadoVida: 10, salvaguardas: ['sabedoria', 'carisma'], prioridade: ['forca', 'carisma', 'constituicao', 'sabedoria', 'destreza', 'inteligencia'], conjuracao: 'Carisma' },
  { nome: 'Patrulheiro', dadoVida: 10, salvaguardas: ['forca', 'destreza'], prioridade: ['destreza', 'sabedoria', 'constituicao', 'forca', 'inteligencia', 'carisma'], conjuracao: 'Sabedoria' },
];

export const ESPECIES = ['Aasimar', 'Anão', 'Draconato', 'Elfo', 'Gnomo', 'Golias', 'Halfling', 'Humano', 'Orc', 'Tiferino'];

export const ANTECEDENTES = [
  'Acólito', 'Andarilho', 'Artesão', 'Artista', 'Charlatão', 'Criminoso', 'Eremita', 'Escriba',
  'Fazendeiro', 'Guarda', 'Guia', 'Marinheiro', 'Mercador', 'Nobre', 'Sábio', 'Soldado',
];

export const TAMANHOS = ['Miúdo', 'Pequeno', 'Médio', 'Grande', 'Enorme', 'Imenso'];

export const TIPOS_DE_CRIATURA = [
  'Aberração', 'Besta', 'Celestial', 'Constructo', 'Corruptor', 'Dragão', 'Elemental', 'Fada',
  'Gigante', 'Humanoide', 'Limo', 'Monstruosidade', 'Morto-vivo', 'Planta',
];

export const ALINHAMENTOS = [
  'Leal e Bom', 'Neutro e Bom', 'Caótico e Bom', 'Leal e Neutro', 'Neutro', 'Caótico e Neutro',
  'Leal e Mau', 'Neutro e Mau', 'Caótico e Mau', 'Imparcial',
];

/** Arranjo padrão do Livro do Jogador. */
export const ARRANJO_PADRAO = [15, 14, 13, 12, 10, 8];

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** A classe da lista, ignorando acento, maiúsculas e o feminino mais comum ("Maga", "Guerreira"). */
export function acharClasse(nome: string | null | undefined): ClasseDnd | undefined {
  if (!nome) return undefined;
  const alvo = sem(nome);
  return CLASSES.find(c => {
    const base = sem(c.nome);
    return base === alvo || base.replace(/o$/, 'a') === alvo || base + 'a' === alvo;
  });
}

export function modificador(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return null;
  return Math.floor((Number(valor) - 10) / 2);
}

export function comSinal(n: number | null): string {
  if (n === null) return '—';
  return n >= 0 ? `+${n}` : `${n}`;
}

export function bonusDeProficienciaPorNivel(nivel: number): number {
  const n = Math.min(20, Math.max(1, Math.floor(nivel) || 1));
  return 2 + Math.floor((n - 1) / 4);
}

export function bonusDeProficienciaPorNd(nd: string): number {
  const valor = nd.includes('/') ? 0 : Number(nd) || 0;
  return valor < 5 ? 2 : Math.min(9, 2 + Math.ceil((valor - 4) / 4));
}

/** PV pela regra de valor fixo: dado cheio no 1º nível e a média (metade + 1) nos demais, somando a CON em cada nível. */
export function pvSugerido(dadoVida: number, nivel: number, constituicao: number | null | undefined): number {
  const con = modificador(constituicao) ?? 0;
  const n = Math.min(20, Math.max(1, Math.floor(nivel) || 1));
  let pv = Math.max(1, dadoVida + con);
  for (let i = 2; i <= n; i++) pv += Math.max(1, dadoVida / 2 + 1 + con);
  return pv;
}

/** Entra em combate com bloco de estatísticas: monstro, ou NPC de combate ou vilão. */
export function temBlocoDeCombate(tipoId: number, categoria: string | null | undefined): boolean {
  return tipoId === MONSTRO || (tipoId === NPC && (categoria === 'Inimigo' || categoria === 'Vilao'));
}

function vazio(v: unknown): boolean { return v === null || v === undefined || String(v).trim() === ''; }
const numero = (v: unknown) => (vazio(v) ? NaN : Number(v));

/** O que falta para criar o personagem (vazio = pode criar). */
export function faltasParaCriar(p: any): Falta[] {
  const faltas: Falta[] = [];
  const add = (campo: string, aba: AbaDaFicha, mensagem: string) => faltas.push({ campo, aba, mensagem });

  if (vazio(p?.nome)) add('nome', 'basico', 'Dê um nome ao personagem.');
  if (!p?.campanhaId) add('campanhaId', 'basico', 'Escolha a campanha.');

  const tipoId = Number(p?.tipoId) || HEROI;
  if (tipoId === HEROI) {
    const j = p?.personagemPlayer ?? {};
    if (vazio(j.classe)) add('classe', 'basico', 'Escolha a classe.');
    if (vazio(j.raca)) add('raca', 'basico', 'Escolha a espécie.');
    if (vazio(j.antecedente)) add('antecedente', 'basico', 'Escolha o antecedente.');
    const nivel = numero(j.nivel);
    if (!(nivel >= 1 && nivel <= 20)) add('nivel', 'basico', 'O nível vai de 1 a 20.');
    else if (nivel >= 3 && vazio(j.subclasse)) add('subclasse', 'basico', 'A partir do nível 3, escolha a subclasse.');
  } else {
    const npc = p?.personagemNpc ?? {};
    if (!temBlocoDeCombate(tipoId, npc.categoriaUso)) return faltas; // NPC narrativo: só o nome
    if (vazio(npc.tamanho)) add('tamanho', 'basico', 'Informe o tamanho.');
    if (vazio(npc.tipoCriatura)) add('tipoCriatura', 'basico', 'Informe o tipo de criatura.');
    if (!(String(npc.nivelDesafio ?? '').trim() in XP_POR_ND)) add('nivelDesafio', 'basico', 'Escolha o nível de desafio (ND).');
  }

  const a = p?.atributo ?? {};
  const valores = ATRIBUTOS.map(x => numero(a[x.chave]));
  if (valores.some(v => isNaN(v))) add('atributos', 'atributos', 'Preencha os seis atributos.');
  else if (valores.some(v => v < 1 || v > 30)) add('atributos', 'atributos', 'Cada atributo vai de 1 a 30.');

  const c = p?.personagemCombate ?? {};
  if (!(numero(c.vidaMaxima) >= 1)) add('vidaMaxima', 'atributos', 'Informe os pontos de vida máximos.');
  if (!(numero(c.classeArmadura) >= 1)) add('classeArmadura', 'atributos', 'Informe a classe de armadura (CA).');
  if (vazio(c.deslocamento)) add('deslocamento', 'atributos', 'Informe o deslocamento.');
  return faltas;
}

/** Campos obrigatórios para o tipo/categoria (para marcar os rótulos na tela). */
export function camposObrigatorios(tipoId: number, categoria: string | null | undefined, nivel = 1): Set<string> {
  const campos = new Set(['nome', 'campanhaId']);
  const combate = ['atributos', 'vidaMaxima', 'classeArmadura', 'deslocamento'];
  if (tipoId === HEROI) {
    ['classe', 'raca', 'antecedente', 'nivel', ...combate].forEach(c => campos.add(c));
    if (Number(nivel) >= 3) campos.add('subclasse');
  } else if (temBlocoDeCombate(tipoId, categoria)) {
    ['tamanho', 'tipoCriatura', 'nivelDesafio', ...combate].forEach(c => campos.add(c));
  }
  return campos;
}

// ---- ações do bloco de estatísticas ----

export const TIPOS_DE_DANO = [
  'Ácido', 'Concussão', 'Cortante', 'Elétrico', 'Fogo', 'Força', 'Gélido',
  'Necrótico', 'Perfurante', 'Psíquico', 'Radiante', 'Trovejante', 'Veneno',
];

export const TIPOS_DE_ACAO = [
  { valor: 'Ataque', nome: 'Ataque', icone: 'bi-crosshair' },
  { valor: 'Magia', nome: 'Magia', icone: 'bi-stars' },
  { valor: 'Habilidade', nome: 'Habilidade', icone: 'bi-hand-index-thumb' },
];

/** Atributos como a ação guarda ("Forca", "Destreza"...). */
export const ATRIBUTOS_DE_ATAQUE = ATRIBUTOS.map(a => ({ valor: a.chave[0].toUpperCase() + a.chave.slice(1), nome: a.nome }));

/** Bônus de acerto pela ficha: modificador do atributo + proficiência (se proficiente). */
export function bonusDeAtaque(valorDoAtributo: number | null | undefined, proficiente: boolean, proficiencia: number | null | undefined): number | null {
  const m = modificador(valorDoAtributo);
  if (m === null) return null;
  return m + (proficiente ? Number(proficiencia) || 0 : 0);
}

/** A ação como ela aparece no bloco: "Jogada de ataque: +4, alcance 1,5 m. Acerto: 1d8+3 de dano cortante." */
export function previaDaAcao(acao: any): string {
  const desc = String(acao?.descricao ?? '').trim();
  if (acao?.tipoAcao !== 'Ataque') return desc || '—';

  const partes: string[] = [];
  const bonus = vazio(acao.bonusAcerto) ? null : Number(acao.bonusAcerto);
  const alcance = String(acao.alcance ?? '').trim();
  const ataque = [bonus === null || isNaN(bonus) ? '' : comSinal(bonus), alcance ? `alcance ${alcance}` : ''].filter(Boolean).join(', ');
  partes.push(`Jogada de ataque${ataque ? ': ' + ataque : ''}.`);

  const dano = String(acao.dano ?? '').trim();
  const tipo = String(acao.tipoDano ?? '').trim().toLowerCase();
  if (dano) partes.push(`Acerto: ${dano}${tipo ? ' de dano ' + tipo : ''}.`);
  if (desc) partes.push(desc);
  return partes.join(' ');
}
