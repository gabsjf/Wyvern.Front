import type { GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

type Three = typeof import('three');

/**
 * O leitor de .glb do Three.js com dois ajustes. Todo .glb do app deve ser aberto por aqui.
 *
 * - Lê as texturas embutidas por <img> em vez de fetch(). Por padrão ele usa o ImageBitmapLoader, que busca cada textura
 *   com fetch(blob:...); a CSP do Wyvern libera blob: para imagens (img-src) mas não para conexões (connect-src): o fetch
 *   era barrado, o leitor engolia o erro e o modelo vinha sem nenhuma textura.
 * - Entende o material "especular/brilho" (KHR_materials_pbrSpecularGlossiness), que o Three.js deixou de ler: muitos
 *   modelos antigos do Sketchfab usam só ele, e vinham brancos.
 */
export async function criarLeitorGltf(): Promise<GLTFLoader> {
  const [T, { GLTFLoader }] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')]);
  return new GLTFLoader()
    .register(parser => {
      // o parser já montou o leitor dele; troca antes de qualquer textura ser pedida
      const leitor = new T.TextureLoader(parser.options.manager);
      leitor.setCrossOrigin(parser.options.crossOrigin);
      parser.textureLoader = leitor;
      return { name: 'WYVERN_texturas_por_img' };
    })
    .register(parser => especularBrilho(T, parser));
}

const ESPECULAR_BRILHO = 'KHR_materials_pbrSpecularGlossiness';

interface EspecularBrilho {
  diffuseFactor?: [number, number, number, number];
  diffuseTexture?: { index: number; texCoord?: number };
  glossinessFactor?: number;
}

/**
 * Converte para o material comum (metal/rugosidade): a cor difusa vira a cor base, o brilho vira o inverso da rugosidade
 * e nada é metal. Perde só o reflexo colorido do especular, que quase não aparece numa mesa vista de cima.
 */
function especularBrilho(T: Three, parser: GLTFParser): GLTFLoaderPlugin {
  return {
    name: ESPECULAR_BRILHO,
    extendMaterialParams: (indice, params) => {
      const ext = parser.json.materials?.[indice]?.extensions?.[ESPECULAR_BRILHO] as EspecularBrilho | undefined;
      if (!ext) return Promise.resolve();
      const [r, g, b, a] = ext.diffuseFactor ?? [1, 1, 1, 1];
      params['color'] = new T.Color().setRGB(r, g, b, T.LinearSRGBColorSpace);
      params['opacity'] = a;
      params['metalness'] = 0;
      params['roughness'] = 1 - (ext.glossinessFactor ?? 1);
      return ext.diffuseTexture ? parser.assignTexture(params, 'map', ext.diffuseTexture, T.SRGBColorSpace) : Promise.resolve();
    },
  };
}
