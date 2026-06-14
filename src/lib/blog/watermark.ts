/**
 * Marca de agua de marca para la portada del blog — Brief #018 T2.
 *
 * Recibe el Buffer de la imagen de Gemini (PNG ~1344×768) y devuelve un PNG
 * 1200×630 (formato og:image) con una banda inferior translúcida azul marino,
 * el logo de marca (en blanco, para verse sobre el navy) y el dominio
 * `tuasesoralvaro.com`.
 *
 * Robustez en Netlify Functions:
 *  - Usa SOLO jimp core (JS puro, sin binarios nativos como sharp).
 *  - NO lee `public/` en runtime (la función serverless no incluye esa carpeta):
 *    el logo se reutiliza del base64 embebido en `../brandLogo`.
 *  - NO carga fuentes en runtime (los .fnt de @jimp son paths en disco que el
 *    file-tracing de Next puede no incluir): el dominio va pre-renderizado como
 *    base64 en `./watermarkAssets`.
 *
 * Graceful: si la composición falla, devuelve la imagen ORIGINAL sin banda
 * (mejor con imagen que sin ella). Si no hay imagen base, devuelve null.
 *
 * No tiene test jest propio porque jimp es ESM-only y la suite corre con
 * ts-jest→CommonJS; la composición se valida con un probe de integración real
 * (render real + inspección visual + dims) y end-to-end al disparar el cron.
 */

import { Jimp, JimpMime, BlendMode } from 'jimp';
import { BRAND_LOGO_PNG_BASE64 } from '../brandLogo';
import { WORDMARK_PNG_BASE64 } from './watermarkAssets';

// ── Lienzo og:image ──
const OUT_W = 1200;
const OUT_H = 630;

// ── Banda de marca ──
const BAND_H = 76;
const BAND_NAVY = 0x2c3e50ff;   // azul marino de marca
const BAND_OPACITY = 0.72;      // translúcida: deja ver la ilustración debajo
const GOLD = 0xfbbf24ff;        // acento dorado de marca
const GOLD_LINE_H = 3;          // filete dorado en el borde superior de la banda

// ── Elementos dentro de la banda ──
const PAD_LEFT = 32;
const LOGO_H = 44;              // alto del logo en px
const GAP_LOGO_TEXT = 22;       // separación logo ↔ dominio
const WORDMARK_H = 26;          // alto del dominio en px

/**
 * Compone la marca de agua sobre la imagen de portada.
 * @param base Buffer de la imagen de Gemini (PNG), o null.
 * @returns PNG 1200×630 con banda, o la imagen original si la composición
 *          falla, o null si no había imagen base.
 */
export async function applyWatermark(base: Buffer | null): Promise<Buffer | null> {
  if (!base || base.length === 0) return null;
  try {
    const img = await Jimp.read(base);
    // Recorta/escala a 1200×630 rellenando el lienzo (og:image).
    img.cover({ w: OUT_W, h: OUT_H });

    const bandTop = OUT_H - BAND_H;

    // Banda navy translúcida + filete dorado superior.
    const band = new Jimp({ width: OUT_W, height: BAND_H, color: BAND_NAVY });
    img.composite(band, 0, bandTop, { mode: BlendMode.SRC_OVER, opacitySource: BAND_OPACITY });
    const goldLine = new Jimp({ width: OUT_W, height: GOLD_LINE_H, color: GOLD });
    img.composite(goldLine, 0, bandTop, { mode: BlendMode.SRC_OVER, opacitySource: 0.9 });

    // Logo recoloreado a blanco (el original es navy → invisible sobre navy).
    const logo = await Jimp.read(Buffer.from(BRAND_LOGO_PNG_BASE64, 'base64'));
    const data = logo.bitmap.data; // RGBA: ponemos RGB=blanco, conservamos alfa.
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    logo.resize({ h: LOGO_H });
    const logoY = Math.round(bandTop + (BAND_H - logo.height) / 2);
    img.composite(logo, PAD_LEFT, logoY);

    // Dominio (pre-renderizado en blanco sobre transparente).
    const wordmark = await Jimp.read(Buffer.from(WORDMARK_PNG_BASE64, 'base64'));
    wordmark.resize({ h: WORDMARK_H });
    const wordmarkX = PAD_LEFT + logo.width + GAP_LOGO_TEXT;
    const wordmarkY = Math.round(bandTop + (BAND_H - wordmark.height) / 2);
    img.composite(wordmark, wordmarkX, wordmarkY);

    return await img.getBuffer(JimpMime.png);
  } catch (err) {
    // Mejor publicar con la imagen sin banda que sin imagen.
    console.warn('[blog image] watermark falló, se usa la imagen sin banda:', err);
    return base;
  }
}
