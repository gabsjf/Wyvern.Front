/** As condições do D&D 5e, para escolher com um clique em vez de digitar. */
export const CONDICOES = [
  'Agarrado', 'Amedrontado', 'Atordoado', 'Caído', 'Cego', 'Concentrando', 'Contido', 'Enfeitiçado', 'Envenenado',
  'Exausto', 'Incapacitado', 'Inconsciente', 'Invisível', 'Paralisado', 'Petrificado', 'Surdo',
] as const;

/** "Envenenado, Caído" → ["Envenenado", "Caído"] (sem vazios nem repetidos, preservando a ordem). */
export function lerCondicoes(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const lista: string[] = [];
  for (const parte of (texto ?? '').split(/[,;]/)) {
    const nome = parte.trim();
    const chave = nome.toLowerCase();
    if (nome && !vistas.has(chave)) {
      vistas.add(chave);
      lista.push(nome);
    }
  }
  return lista;
}

export function escreverCondicoes(lista: string[]): string {
  return lista.join(', ');
}

export function temCondicao(texto: string | null | undefined, nome: string): boolean {
  return lerCondicoes(texto).some(c => c.toLowerCase() === nome.toLowerCase());
}

/** Liga ou desliga uma condição, devolvendo o novo texto. */
export function alternarCondicao(texto: string | null | undefined, nome: string): string {
  const lista = lerCondicoes(texto);
  const existe = lista.some(c => c.toLowerCase() === nome.toLowerCase());
  return escreverCondicoes(existe ? lista.filter(c => c.toLowerCase() !== nome.toLowerCase()) : [...lista, nome]);
}
