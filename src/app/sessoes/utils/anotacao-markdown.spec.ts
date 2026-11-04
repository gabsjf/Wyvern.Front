import { alternarTarefa, aplicarMencoes, aplicarTarefas, contarTarefas, prepararMarkdown } from './anotacao-markdown';

describe('anotações: menções', () => {
  const conhecidos = [
    { nome: 'Thorin', personagemId: 10 },
    { nome: 'Thorin Pedraferro', personagemId: 11 },
    { nome: 'Strahd' },
  ];

  it('vira link para a ficha quando há personagem', () => {
    expect(aplicarMencoes('Falar com @Thorin hoje', conhecidos)).toBe('Falar com [@Thorin](/ficha/10) hoje');
  });

  it('o nome mais longo vence ("@Thorin Pedraferro" não vira "@Thorin" + resto)', () => {
    expect(aplicarMencoes('Viu @Thorin Pedraferro?', conhecidos)).toBe('Viu [@Thorin Pedraferro](/ficha/11)?');
  });

  it('sem ficha acessível vira só destaque', () => {
    expect(aplicarMencoes('O senhor @Strahd chegou', conhecidos)).toBe('O senhor **@Strahd** chegou');
  });

  it('não diferencia maiúsculas nem acentos de contexto, e funciona no começo do texto', () => {
    expect(aplicarMencoes('@thorin dormiu', conhecidos)).toBe('[@Thorin](/ficha/10) dormiu');
  });

  it('não casa no meio de outra palavra nem de outro nome', () => {
    expect(aplicarMencoes('e@Thorin', conhecidos)).toBe('e@Thorin');
    expect(aplicarMencoes('@Thorinho', conhecidos)).toBe('@Thorinho');
  });

  it('menciona o mesmo nome várias vezes e aceita pontuação depois', () => {
    expect(aplicarMencoes('@Strahd, @Strahd.', conhecidos)).toBe('**@Strahd**, **@Strahd**.');
  });

  it('nomes com caracteres especiais de regex não quebram', () => {
    expect(aplicarMencoes('Oi @Brum (o ladino)', [{ nome: 'Brum (o ladino)', personagemId: 3 }])).toBe('Oi [@Brum (o ladino)](/ficha/3)');
  });

  it('sem nada conhecido, o texto fica igual', () => {
    expect(aplicarMencoes('Oi @Alguém', [])).toBe('Oi @Alguém');
  });
});

describe('anotações: checklists', () => {
  const roteiro = '## Cenas\n- [ ] Abertura\n- [x] Taverna\n  - [ ] Subitem\n* [X] Estrada\ntexto [ ] solto\n';

  it('conta as tarefas, inclusive aninhadas e com outros marcadores', () => {
    expect(contarTarefas(roteiro)).toBe(4);
    expect(contarTarefas('sem nada')).toBe(0);
  });

  it('marca e desmarca a tarefa pela posição', () => {
    expect(alternarTarefa(roteiro, 0)).toContain('- [x] Abertura');
    expect(alternarTarefa(roteiro, 1)).toContain('- [ ] Taverna');
    expect(alternarTarefa(roteiro, 2)).toContain('  - [x] Subitem');
    expect(alternarTarefa(roteiro, 3)).toContain('* [ ] Estrada');
  });

  it('só muda a tarefa pedida', () => {
    const novo = alternarTarefa(roteiro, 0);
    expect(novo.replace('- [x] Abertura', '- [ ] Abertura')).toBe(roteiro);
  });

  it('posição que não existe não muda nada', () => {
    expect(alternarTarefa(roteiro, 9)).toBe(roteiro);
  });

  it('ignora "[ ]" que não é item de lista', () => {
    expect(alternarTarefa('texto [ ] solto', 0)).toBe('texto [ ] solto');
  });

  it('as caixas aparecem como elementos clicáveis e acessíveis', () => {
    const html = aplicarTarefas('- [ ] Abrir\n- [x] Fechar');
    expect(html).toContain('<span class="tarefa" role="checkbox" tabindex="0" aria-checked="false">☐</span> Abrir');
    expect(html).toContain('aria-checked="true">☑</span> Fechar');
  });

  it('alternar e aplicar andam juntos: a ordem das caixas é a ordem das tarefas', () => {
    const marcado = alternarTarefa('- [ ] a\n- [ ] b', 1);
    expect(prepararMarkdown(marcado, [])).toContain('aria-checked="true">☑</span> b');
  });
});
