/** Névoa de guerra: um bit por quadrado da grade, linha a linha (o mesmo formato do servidor). */

export interface Neblina {
  ativa: boolean;
  colunas: number;
  linhas: number;
  bits: Uint8Array;
}

export interface RetanguloDeQuadrados {
  coluna: number;
  linha: number;
  largura: number;
  altura: number;
}

export function decodificar(base64: string): Uint8Array {
  const texto = atob(base64);
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return bytes;
}

export function estaRevelado(n: Neblina, coluna: number, linha: number): boolean {
  if (coluna < 0 || linha < 0 || coluna >= n.colunas || linha >= n.linhas) return false;
  const i = linha * n.colunas + coluna;
  return (n.bits[i >> 3] & (1 << (i & 7))) !== 0;
}

/** Um token aparece se algum dos quadrados que ele ocupa está revelado. */
export function areaRevelada(n: Neblina, coluna: number, linha: number, tamanho: number): boolean {
  for (let l = linha; l < linha + tamanho; l++)
    for (let c = coluna; c < coluna + tamanho; c++) if (estaRevelado(n, c, l)) return true;
  return false;
}

/** Revela ou cobre o retângulo (cortado nos limites do mapa), devolvendo uma névoa nova. */
export function aplicarRetangulo(n: Neblina, r: RetanguloDeQuadrados, revelar: boolean): Neblina {
  const bits = n.bits.slice();
  const c1 = Math.min(n.colunas, r.coluna + r.largura);
  const l1 = Math.min(n.linhas, r.linha + r.altura);
  for (let l = Math.max(0, r.linha); l < l1; l++)
    for (let c = Math.max(0, r.coluna); c < c1; c++) {
      const i = l * n.colunas + c;
      if (revelar) bits[i >> 3] |= 1 << (i & 7);
      else bits[i >> 3] &= ~(1 << (i & 7));
    }
  return { ...n, bits };
}

/** Retângulo entre dois quadrados quaisquer (em qualquer ordem), contando os dois. */
export function retanguloEntre(c1: number, l1: number, c2: number, l2: number): RetanguloDeQuadrados {
  return {
    coluna: Math.min(c1, c2), linha: Math.min(l1, l2),
    largura: Math.abs(c2 - c1) + 1, altura: Math.abs(l2 - l1) + 1,
  };
}
