// Node recente define um `localStorage` global sem arquivo de backing, que fica indefinido e esconde o do jsdom.
// Garantimos um armazenamento em memória para que os testes rodem igual em qualquer versão do Node.
function criarStorage(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() { return dados.size; },
    clear: () => dados.clear(),
    getItem: (chave: string) => (dados.has(chave) ? dados.get(chave)! : null),
    key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
    removeItem: (chave: string) => { dados.delete(chave); },
    setItem: (chave: string, valor: string) => { dados.set(chave, String(valor)); },
  };
}

for (const nome of ['localStorage', 'sessionStorage'] as const) {
  let utilizavel = false;
  try {
    utilizavel = typeof (globalThis as any)[nome]?.getItem === 'function';
  } catch {
    utilizavel = false;
  }

  if (!utilizavel) {
    Object.defineProperty(globalThis, nome, { value: criarStorage(), configurable: true, writable: true });
  }
}
