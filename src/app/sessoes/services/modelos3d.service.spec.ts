import { formatarTamanho, pareceGlb } from './modelos3d.service';
import { nomeDoArquivo } from '../../campaigns/pages/modelos-3d/modelos-3d';

/** Cabeçalho de um .glb: "glTF", versão e tamanho total (little-endian). */
function cabecalho(magico = 'glTF', versao = 2, total = 1000): ArrayBuffer {
  const b = new ArrayBuffer(12);
  const v = new DataView(b);
  for (let i = 0; i < 4; i++) v.setUint8(i, magico.charCodeAt(i));
  v.setUint32(4, versao, true);
  v.setUint32(8, total, true);
  return b;
}

describe('modelos 3D (WYV-25/26)', () => {
  it('reconhece um .glb pelo cabeçalho antes de enviar', () => {
    expect(pareceGlb(cabecalho(), 1000)).toBe(true);
    expect(pareceGlb(cabecalho('PNG!'), 1000)).toBe(false);
    expect(pareceGlb(cabecalho('glTF', 1), 1000)).toBe(false);
    expect(pareceGlb(cabecalho('glTF', 2, 999), 1000)).toBe(false); // arquivo cortado
    expect(pareceGlb(new ArrayBuffer(4), 4)).toBe(false);
  });

  it('mostra o tamanho em KB ou MB', () => {
    expect(formatarTamanho(300)).toBe('1 KB');
    expect(formatarTamanho(200 * 1024)).toBe('200 KB');
    expect(formatarTamanho(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatarTamanho(2.5 * 1024 * 1024)).toBe('2,5 MB');
  });

  it('sugere o nome a partir do arquivo', () => {
    expect(nomeDoArquivo('goblin_arqueiro.glb')).toBe('Goblin arqueiro');
    expect(nomeDoArquivo('Mesa-de-taverna.GLB')).toBe('Mesa de taverna');
  });
});
