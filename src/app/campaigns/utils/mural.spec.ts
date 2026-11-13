import { ElementoMural, QuadroMural } from '../models/mural';
import {
  Historico, colar, duplicar, elementoEm, elementosNoRetangulo, lerQuadro, limites, mover, pontoNaBorda, recorte, redimensionar,
  remover, reordenar, trechoDoConector,
} from './mural';

const el = (id: string, x: number, y: number, extra: Partial<ElementoMural> = {}): ElementoMural =>
  ({ id, tipo: 'nota', x, y, w: 100, h: 100, cor: 'amarelo', texto: '', ...extra });

function quadro(): QuadroMural {
  return {
    versao: 1,
    elementos: [el('a', 0, 0), el('b', 300, 0), el('c', 0, 300)],
    conectores: [
      { id: 'ab', de: { elementoId: 'a', x: 0, y: 0 }, para: { elementoId: 'b', x: 0, y: 0 }, cor: 'cinza', seta: true },
      { id: 'solta', de: { x: 500, y: 500 }, para: { x: 600, y: 500 }, cor: 'cinza', seta: true },
    ],
  };
}

const ids = (...lista: string[]) => new Set(lista);

describe('lerQuadro', () => {
  it('texto vazio, inválido ou que não é objeto vira quadro vazio', () => {
    for (const json of ['', 'lixo', '[1,2]', 'null']) expect(lerQuadro(json)).toEqual({ versao: 1, elementos: [], conectores: [] });
  });

  it('descarta o que não reconhece e completa o que falta', () => {
    const q = lerQuadro(JSON.stringify({
      elementos: [
        { id: 'n', tipo: 'nota', x: 5, y: 6 },
        { id: 'x', tipo: 'foguete' },
        { id: 'f', tipo: 'forma', forma: 'estrela', cor: 'neon' },
        { id: 'i', tipo: 'imagem' },             // imagem sem arquivo
        { id: 'k', tipo: 'cartao', ref: { tipo: 'personagem', id: 3, titulo: 'Lyra' } },
      ],
    }));
    expect(q.elementos.map(e => e.id)).toEqual(['n', 'f', 'k']);
    expect(q.elementos[0]).toMatchObject({ w: 200, h: 200, cor: 'amarelo', texto: '' });
    expect(q.elementos[1]).toMatchObject({ forma: 'retangulo', cor: 'amarelo' });
  });

  it('seta presa a um elemento que sumiu fica solta onde estava', () => {
    const q = lerQuadro(JSON.stringify({ elementos: [el('a', 0, 0)], conectores: [{ id: 's', de: { elementoId: 'a' }, para: { elementoId: 'fantasma', x: 9, y: 8 } }] }));
    expect(q.conectores[0].de.elementoId).toBe('a');
    expect(q.conectores[0].para).toEqual({ x: 9, y: 8 });
  });

  it('ida e volta pelo JSON não muda nada', () => {
    const q = quadro();
    expect(lerQuadro(JSON.stringify(q))).toEqual(q);
  });
});

describe('geometria', () => {
  it('a seta encosta na borda do retângulo, da elipse e do losango', () => {
    const r = el('r', 0, 0, { w: 100, h: 50 });
    expect(pontoNaBorda(r, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(pontoNaBorda(r, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });

    const elipse = el('e', 0, 0, { tipo: 'forma', forma: 'elipse', w: 100, h: 100 });
    const p = pontoNaBorda(elipse, { x: 200, y: 200 });
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(50);

    const losango = el('l', 0, 0, { tipo: 'forma', forma: 'losango', w: 100, h: 100 });
    const q = pontoNaBorda(losango, { x: 200, y: 200 });
    expect(Math.abs(q.x - 50) + Math.abs(q.y - 50)).toBeCloseTo(50);
  });

  it('a seta entre dois elementos vai de borda a borda e acompanha quando eles se movem', () => {
    const q = quadro();
    expect(trechoDoConector(q.conectores[0], q.elementos)).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 });
    const movido = mover(q, ids('b'), 0, 200);
    const t = trechoDoConector(movido.conectores[0], movido.elementos);
    expect(t.y2).toBeGreaterThan(50);
  });

  it('acha o elemento de cima no ponto e os tocados pelo laço', () => {
    const q = { ...quadro(), elementos: [...quadro().elementos, el('cima', 50, 50)] };
    expect(elementoEm(q.elementos, 60, 60)?.id).toBe('cima');
    expect(elementoEm(q.elementos, 60, 60, 'cima')?.id).toBe('a');
    expect(elementoEm(q.elementos, 1000, 1000)).toBeUndefined();
    expect(elementosNoRetangulo(q.elementos, { x: -10, y: -10, w: 120, h: 400 }).sort()).toEqual(['a', 'c', 'cima']);
  });

  it('limites cobrem elementos e pontas soltas; quadro vazio não tem limites', () => {
    expect(limites(quadro())).toEqual({ x: 0, y: 0, w: 600, h: 500 });
    expect(limites({ versao: 1, elementos: [], conectores: [] })).toBeNull();
  });

  it('redimensionar segura o canto oposto, respeita o mínimo e, se pedido, a proporção', () => {
    const original = { x: 100, y: 100, w: 200, h: 100 };
    expect(redimensionar(original, 'se', 400, 300)).toEqual({ x: 100, y: 100, w: 300, h: 200 });
    expect(redimensionar(original, 'nw', 50, 150)).toEqual({ x: 50, y: 150, w: 250, h: 50 });
    expect(redimensionar(original, 'se', 101, 101)).toMatchObject({ w: 24, h: 24 });
    const prop = redimensionar(original, 'se', 500, 150, true);
    expect(prop.w / prop.h).toBeCloseTo(2);
  });
});

describe('operações', () => {
  it('mover leva os elementos e as pontas soltas das setas escolhidas', () => {
    const q = mover(quadro(), ids('a', 'solta'), 10, 20);
    expect(q.elementos.find(e => e.id === 'a')).toMatchObject({ x: 10, y: 20 });
    expect(q.elementos.find(e => e.id === 'b')).toMatchObject({ x: 300, y: 0 });
    expect(q.conectores.find(c => c.id === 'solta')?.de).toEqual({ x: 510, y: 520 });
    expect(q.conectores.find(c => c.id === 'ab')?.de.elementoId).toBe('a');
  });

  it('remover apaga junto as setas presas ao que foi apagado', () => {
    const q = remover(quadro(), ids('b'));
    expect(q.elementos.map(e => e.id)).toEqual(['a', 'c']);
    expect(q.conectores.map(c => c.id)).toEqual(['solta']);
  });

  it('duplicar copia com ids novos e liga as cópias entre si', () => {
    const { quadro: q, novos } = duplicar(quadro(), ids('a', 'b'));
    expect(q.elementos).toHaveLength(5);
    expect(novos).toHaveLength(3); // duas notas + a seta entre elas
    const [na, nb] = novos;
    const setaNova = q.conectores.find(c => c.de.elementoId === na);
    expect(setaNova?.para.elementoId).toBe(nb);
    expect(q.elementos.find(e => e.id === na)).toMatchObject({ x: 24, y: 24 });
  });

  it('reordenar leva para frente ou para trás mantendo a ordem entre os escolhidos', () => {
    expect(reordenar(quadro(), ids('a'), true).elementos.map(e => e.id)).toEqual(['b', 'c', 'a']);
    expect(reordenar(quadro(), ids('c', 'b'), false).elementos.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('copiar e colar no mesmo quadro cria cópias sem mexer nos originais', () => {
    const pedaco = recorte(quadro(), ids('a', 'b'));
    expect(pedaco.conectores.map(c => c.id)).toEqual(['ab']);
    const { quadro: q, novos } = colar(quadro(), pedaco);
    expect(q.elementos.map(e => e.id).slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(q.elementos).toHaveLength(5);
    expect(novos.every(id => !['a', 'b', 'ab'].includes(id))).toBe(true);
    const setaColada = q.conectores.find(c => c.id === novos[2]);
    expect([setaColada?.de.elementoId, setaColada?.para.elementoId]).toEqual([novos[0], novos[1]]);
  });

  it('recorte de uma seta que aponta para fora solta a ponta de fora', () => {
    const pedaco = recorte(quadro(), ids('a', 'ab'));
    expect(pedaco.conectores[0].de.elementoId).toBe('a');
    expect(pedaco.conectores[0].para.elementoId).toBeUndefined();
  });
});

describe('Historico', () => {
  it('desfaz e refaz na ordem certa, e uma mudança nova apaga o que dava para refazer', () => {
    const h = new Historico();
    h.registrar('v1');
    h.registrar('v2');
    expect(h.desfazer('v3')).toBe('v2');
    expect(h.desfazer('v2')).toBe('v1');
    expect(h.desfazer('v1')).toBeNull();
    expect(h.refazer('v1')).toBe('v2');
    h.registrar('x');
    expect(h.podeRefazer).toBe(false);
  });

  it('não guarda o mesmo estado duas vezes seguidas e respeita o limite', () => {
    const h = new Historico(3);
    for (const v of ['1', '1', '2', '3', '4']) h.registrar(v);
    expect(h.desfazer('5')).toBe('4');
    expect(h.desfazer('4')).toBe('3');
    expect(h.desfazer('3')).toBe('2');
    expect(h.podeDesfazer).toBe(false);
  });
});
