/**
 * Recursos de caderno em cima do markdown das anotações:
 *  - menções: "@Thorin" vira um link para a ficha (ou um destaque, se a pessoa não tem ficha que o usuário possa abrir);
 *  - checklists: "- [ ] item" vira uma caixa que se marca com um clique e grava de volta no texto.
 *
 * O texto vem de outros usuários e é sanitizado pelo Angular ao ir para a tela; por isso só se usam marcações simples
 * (span, a, class, role, aria-checked) que o sanitizador mantém.
 */

export interface Mencionavel {
  nome: string;
  /** Com ficha que o usuário pode abrir, a menção vira link; sem, só destaque. */
  personagemId?: number;
}

const TAREFA = /^(\s*[-*+]\s+)\[([ xX])\](?=\s)/gm;

/** Quantas tarefas ("- [ ] ...") o texto tem. */
export function contarTarefas(markdown: string): number {
  return (markdown.match(TAREFA) ?? []).length;
}

/** Marca ou desmarca a tarefa de posição `indice` (0 = a primeira do texto). Índice inexistente não muda nada. */
export function alternarTarefa(markdown: string, indice: number): string {
  let i = -1;
  return markdown.replace(TAREFA, (inteiro, prefixo: string, marca: string) => {
    i++;
    return i === indice ? `${prefixo}[${marca === ' ' ? 'x' : ' '}]` : inteiro;
  });
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Troca "@Nome" por link ou destaque, numa passada só com todos os nomes juntos (o mais longo primeiro): assim
 * "@Thorin Pedraferro" não vira "@Thorin" + resto, e o texto já trocado não é procurado de novo.
 */
export function aplicarMencoes(markdown: string, conhecidos: Mencionavel[]): string {
  const validos = conhecidos.filter(c => c.nome.trim());
  if (validos.length === 0) return markdown;

  const porNome = new Map(validos.map(c => [c.nome.toLowerCase(), c]));
  const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length).map(escaparRegex);
  // não casa dentro de outra palavra ("e@Thorin") nem no meio do nome ("@Thorinho")
  const padrao = new RegExp(String.raw`(^|[^\p{L}\p{N}@])@(${nomes.join('|')})(?![\p{L}\p{N}])`, 'giu');

  return markdown.replace(padrao, (_, antes: string, dito: string) => {
    const c = porNome.get(dito.toLowerCase())!;
    return c.personagemId !== undefined
      ? `${antes}[@${c.nome}](/ficha/${c.personagemId})`
      : `${antes}**@${c.nome}**`;
  });
}

/** Caixas clicáveis no lugar de "[ ]" e "[x]". */
export function aplicarTarefas(markdown: string): string {
  return markdown.replace(TAREFA, (_, prefixo: string, marca: string) => {
    const feita = marca !== ' ';
    return `${prefixo}<span class="tarefa" role="checkbox" tabindex="0" aria-checked="${feita}">${feita ? '☑' : '☐'}</span>`;
  });
}

/** O markdown já pronto para o marked: menções e tarefas aplicadas. */
export function prepararMarkdown(markdown: string, conhecidos: Mencionavel[]): string {
  return aplicarTarefas(aplicarMencoes(markdown ?? '', conhecidos));
}

/** Modelo de roteiro de sessão para o Mestre: cenas, segredos e tesouro como checklists. */
export const MODELO_ROTEIRO = `## Cenas
- [ ] Abertura:
- [ ]
- [ ]

## Segredos e pistas
- [ ]

## Personagens e monstros
- [ ]

## Tesouro e recompensas
- [ ]
`;
