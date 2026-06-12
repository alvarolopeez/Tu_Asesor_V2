/**
 * Tests del parser defensivo de JSON usado en /api/ai/zones (T3, Brief #013).
 *
 * El parser es autocontenido — se replica aquí para no importar el route handler
 * de Next.js (que trae dependencias de supabase/Node que rompen jest). El
 * algoritmo es idéntico al de parseDraftJson en zones/route.ts.
 */

function parseDraftJson(raw: string): Record<string, unknown> | null {
  let jsonStr = (raw || '').trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1];
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(jsonStr.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

describe('parseDraftJson — zones T3', () => {
  it('parsea JSON limpio', () => {
    const result = parseDraftJson('{"detected_zones":["Triana - Triana Casco Antiguo"],"reasoning":"calle Betis"}');
    expect(result).toEqual({ detected_zones: ['Triana - Triana Casco Antiguo'], reasoning: 'calle Betis' });
  });

  it('strip code fences ```json...```', () => {
    const raw = '```json\n{"detected_zones":[],"reasoning":"ninguna"}\n```';
    expect(parseDraftJson(raw)).toEqual({ detected_zones: [], reasoning: 'ninguna' });
  });

  it('strip code fences sin idioma ```...```', () => {
    const raw = '```\n{"detected_zones":["Centro - Alfalfa"]}\n```';
    expect(parseDraftJson(raw)?.detected_zones).toEqual(['Centro - Alfalfa']);
  });

  it('rescata JSON con preámbulo de texto (grounding puede añadir preámbulo)', () => {
    const raw = 'Aquí mi respuesta en JSON:\n{"detected_zones":["Macarena - Amargura"],"reasoning":"hospital"}';
    expect(parseDraftJson(raw)?.detected_zones).toEqual(['Macarena - Amargura']);
  });

  it('rescata JSON con postámbulo de texto', () => {
    const raw = '{"detected_zones":["Sur / Heliópolis"]} (nota adicional del modelo)';
    expect(parseDraftJson(raw)?.detected_zones).toEqual(['Sur / Heliópolis']);
  });

  it('devuelve null para texto sin JSON', () => {
    expect(parseDraftJson('esto no es JSON')).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(parseDraftJson('')).toBeNull();
  });
});
