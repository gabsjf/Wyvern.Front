/**
 * Quem responde pelo Wyvern nos Termos e na Política de Privacidade (LGPD, art. 9º e art. 41).
 * Um lugar só: as duas páginas leem daqui. Revise a data sempre que mudar o texto.
 */
export const DADOS_LEGAIS = {
  /** Controlador: pessoa física ou razão social de quem mantém o Wyvern. */
  responsavel: '[PREENCHER: nome ou razão social]',
  /** CPF não vai aqui; CNPJ, se houver. Vazio esconde a linha. */
  cnpj: '',
  /** Canal do titular e do encarregado (DPO). */
  emailPrivacidade: '[PREENCHER: e-mail de contato]',
  /** Encarregado pelo tratamento de dados (LGPD, art. 41). */
  encarregado: '[PREENCHER: nome do encarregado]',
  site: 'https://wyvern.sbs',
  atualizadoEm: '11 de novembro de 2026',
  /** Prazo para responder pedidos do titular (LGPD, art. 19, II). */
  prazoRespostaDias: 15,
} as const;
