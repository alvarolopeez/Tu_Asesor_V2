/**
 * LLM-as-parser para respuestas naturales del cliente.
 *
 * Problema histórico (root cause E del brief 2026-06-08):
 *   Los parsers regex de scheduling.ts (parseSavings, parseFunding,
 *   parseTipoCompra) son rígidos. Fallan con respuestas naturales como
 *   "tengo unos 30 mil", "voy con efectivo", "para vivir nosotros".
 *   El bot entonces responde "No he sabido leer la cifra" → bucle.
 *
 * Estrategia:
 *   1. El caller (scheduling) prueba regex barato primero (camino feliz).
 *   2. Si regex devuelve null, llama a parseWithLLM con la pregunta
 *      original + la respuesta del cliente + el schema esperado.
 *   3. El LLM devuelve JSON estructurado o null si tampoco lo entiende.
 *
 * Modelo: el más barato del provider activo (gemini-flash-latest).
 * No pasamos historial — es un parser stateless, sin contexto.
 *
 * @added 2026-06-08 Sprint chatbot UX — T5
 */

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'keywords';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export type ParserSchema =
  | { type: 'number' }
  | { type: 'enum'; enumValues: string[] }
  | { type: 'string'; maxLen?: number };

interface ParserResult<T> {
  value: T | null;
  confidence: number;
  reason?: string;
}

/**
 * Construye el prompt de extracción.
 * Es deliberadamente minimalista — el LLM solo hace UN trabajo: extraer un
 * valor estructurado. No quiere historia, no quiere catálogo.
 */
function buildExtractorPrompt(
  question: string,
  userMessage: string,
  schema: ParserSchema,
): string {
  let schemaDescription: string;
  let example: string;

  if (schema.type === 'number') {
    schemaDescription = 'un número entero (cantidad en euros). Acepta "30k", "30 mil", "treinta mil", "30.000€", "unos 30mil", etc.';
    example = '{"value": 30000, "confidence": 0.95}';
  } else if (schema.type === 'enum') {
    schemaDescription = `EXACTAMENTE uno de estos valores: ${schema.enumValues.map((v) => `"${v}"`).join(', ')}. Si el cliente responde con una variante natural, mapéala al valor más cercano.`;
    example = `{"value": "${schema.enumValues[0]}", "confidence": 0.9}`;
  } else {
    const maxLen = schema.maxLen || 100;
    schemaDescription = `un string libre extraído de la respuesta (máximo ${maxLen} caracteres).`;
    example = '{"value": "texto", "confidence": 0.8}';
  }

  return [
    'Eres un extractor estructurado de respuestas en castellano. Tu único trabajo es leer la pregunta y la respuesta del cliente, y devolver un JSON con el valor extraído.',
    '',
    `Pregunta hecha al cliente: "${question}"`,
    `Respuesta del cliente: "${userMessage}"`,
    '',
    `El campo "value" debe ser: ${schemaDescription}`,
    '',
    'Reglas:',
    '- Si la respuesta es ambigua o no se puede mapear, devuelve "value": null y "reason" breve.',
    '- "confidence" debe estar entre 0 y 1.',
    '- NO añadas texto fuera del JSON. NO uses markdown.',
    '',
    `Ejemplo de salida válida: ${example}`,
    'Ejemplo de "no puedo mapear": {"value": null, "confidence": 0, "reason": "respuesta ambigua"}',
  ].join('\n');
}

function parseRawJson<T>(raw: string): ParserResult<T> | null {
  if (!raw) return null;
  let str = raw.trim();
  const fence = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) str = fence[1];
  try {
    const obj = JSON.parse(str) as Record<string, unknown>;
    return {
      value: (obj.value ?? null) as T | null,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    };
  } catch {
    return null;
  }
}

function validateValue<T>(value: T | null, schema: ParserSchema): T | null {
  if (value === null || value === undefined) return null;
  if (schema.type === 'number') {
    const n = Number(value as unknown);
    if (!isFinite(n) || n < 0 || n > 100_000_000) return null;
    return Math.round(n) as unknown as T;
  }
  if (schema.type === 'enum') {
    const s = String(value);
    if (!schema.enumValues.includes(s)) return null;
    return s as unknown as T;
  }
  // string
  if (typeof value !== 'string') return null;
  const maxLen = schema.maxLen || 100;
  return value.slice(0, maxLen).trim() as unknown as T;
}

/**
 * Extrae un valor estructurado de la respuesta del cliente usando el LLM
 * del provider activo. Devuelve null si:
 *  - No hay LLM configurado (LLM_PROVIDER='keywords')
 *  - La API del provider falla
 *  - El LLM no puede mapear la respuesta
 *  - El valor extraído no valida contra el schema
 *
 * IMPORTANTE: no lanza excepciones. El caller decide qué hacer cuando es null
 * (típicamente: pedir reintento amable o escalar).
 */
export async function parseWithLLM<T = unknown>(
  question: string,
  userMessage: string,
  schema: ParserSchema,
): Promise<T | null> {
  if (!userMessage || userMessage.trim().length === 0) return null;
  if (LLM_PROVIDER === 'keywords') return null;

  const prompt = buildExtractorPrompt(question, userMessage, schema);

  try {
    if (LLM_PROVIDER === 'gemini' && GEMINI_API_KEY) {
      const model = 'gemini-flash-latest';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1, // Determinista — es un extractor
              maxOutputTokens: 200,
            },
          }),
        },
      );
      if (!res.ok) {
        console.warn('[llmParser] gemini', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = parseRawJson<T>(text || '');
      if (!parsed) return null;
      return validateValue(parsed.value, schema);
    }

    if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      const parsed = parseRawJson<T>(text || '');
      if (!parsed) return null;
      return validateValue(parsed.value, schema);
    }

    if (LLM_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data.content?.[0]?.text;
      const parsed = parseRawJson<T>(text || '');
      if (!parsed) return null;
      return validateValue(parsed.value, schema);
    }
  } catch (err) {
    console.warn('[llmParser] error:', err);
    return null;
  }

  return null;
}

/**
 * Helper especializado para rescatar la respuesta natural del cliente
 * cuando el LLM principal devuelve un JSON corrupto.
 *
 * Pide al LLM que reformule el contenido en una frase amable en castellano,
 * sin estructura. Es el plan B del parseLLMResponse en engine.ts.
 *
 * Devuelve null si no hay LLM o si tampoco lo logra.
 */
export async function rescueNaturalResponse(rawLlmOutput: string): Promise<string | null> {
  if (!rawLlmOutput || LLM_PROVIDER === 'keywords') return null;

  const prompt = [
    'El siguiente texto es la salida cruda de un LLM que falló al producir JSON válido. Tu trabajo es:',
    '1. Extraer la intención principal del mensaje (lo que el bot quería decir al cliente).',
    '2. Reformularlo en castellano, tono cercano y profesional (máximo 80 palabras).',
    '3. Si no hay nada coherente que recuperar, responde EXACTAMENTE: "ESCALAR".',
    '',
    'Texto crudo:',
    '"""',
    rawLlmOutput.slice(0, 1500),
    '"""',
    '',
    'Responde SOLO con el texto reformulado (o "ESCALAR"), sin comillas, sin JSON.',
  ].join('\n');

  try {
    if (LLM_PROVIDER === 'gemini' && GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
          }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!text || text === 'ESCALAR') return null;
      return text.slice(0, 800);
    }
  } catch (err) {
    console.warn('[llmParser.rescue] error:', err);
  }
  return null;
}
