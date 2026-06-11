/**
 * Tests para POST /api/cron/generate-blog — Brief #010 T2/T3.
 *
 * Mock por tabla de Supabase (patrón de leadFunnel.test.ts) + mock del
 * generador. El handler se invoca con un request mínimo (solo usa
 * headers.get y nada más del NextRequest).
 */

import { POST } from '../../../app/api/cron/generate-blog/route';
import type { DraftPost } from '../generateNewsPost';

// ─── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => {
  function makeChain(): Record<string, jest.Mock> {
    const c: Record<string, jest.Mock> = {};
    ['select', 'eq', 'gte', 'order', 'limit', 'insert'].forEach((m) => {
      c[m] = jest.fn().mockReturnValue(c);
    });
    return c;
  }
  const state: { tables: Record<string, Record<string, jest.Mock>> } = { tables: {} };
  return {
    createClient: jest.fn(() => ({
      from: jest.fn((table: string) => state.tables[table] ?? makeChain()),
      _state: state,
    })),
    _makeChain: makeChain,
  };
});

jest.mock('../generateNewsPost', () => ({
  generateNewsPost: jest.fn(),
}));

function getDbState(): { tables: Record<string, Record<string, jest.Mock>> } {
  const { createClient } = jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock };
  return createClient()._state;
}

function getMakeChain(): () => Record<string, jest.Mock> {
  return (jest.requireMock('@supabase/supabase-js') as { _makeChain: () => Record<string, jest.Mock> })._makeChain;
}

function getGenerateMock(): jest.Mock {
  return (jest.requireMock('../generateNewsPost') as { generateNewsPost: jest.Mock }).generateNewsPost;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SECRET = 'cron-secret-de-test';

function makeRequest(secret?: string) {
  return {
    headers: { get: (name: string) => (name === 'x-cron-secret' ? secret ?? null : null) },
  } as unknown as Parameters<typeof POST>[0];
}

function validDraft(overrides: Partial<DraftPost> = {}): DraftPost {
  const para = 'El mercado inmobiliario de Sevilla mantiene la demanda alta en los barrios consolidados, según las últimas noticias del sector publicadas esta semana en medios locales y nacionales. '.repeat(3);
  return {
    title: 'El mercado inmobiliario de Sevilla acelera este trimestre',
    slug: 'el-mercado-inmobiliario-de-sevilla-acelera-este-trimestre',
    excerpt: 'La demanda en los barrios consolidados de Sevilla sigue al alza según los últimos datos.',
    content: `${para}\n\n## Sección uno\n\n${para}\n\n## Sección dos\n\n${para}`,
    seo_title: 'Mercado inmobiliario Sevilla',
    seo_description: 'Últimas noticias del mercado inmobiliario sevillano.',
    source_urls: ['https://fuente.es/noticia'],
    ...overrides,
  };
}

/**
 * Configura la tabla posts:
 *  - select().gte().order().limit() → recentRows (posts últimos 7 días)
 *  - select().eq().limit() → slugClashResults (se consume en orden, para el
 *    chequeo de slug único; default sin colisión)
 *  - insert() → { error: null } y captura las filas
 */
function setupPosts({
  recentRows = [] as Array<{ title: string; created_at: string }>,
  slugClashResults = [] as Array<Array<{ id: string }>>,
} = {}): { insertedRows: Array<Record<string, unknown>>; insertMock: jest.Mock } {
  const state = getDbState();
  const makeChain = getMakeChain();
  const insertedRows: Array<Record<string, unknown>> = [];

  const chain = makeChain();
  // La query de recientes termina en .limit() tras .gte().order(); la de slug
  // termina en .limit() tras .eq(). Distinguimos por si se llamó .eq() antes.
  let eqCalled = false;
  chain['eq'].mockImplementation(() => {
    eqCalled = true;
    return chain;
  });
  chain['limit'].mockImplementation(() => {
    if (eqCalled) {
      eqCalled = false;
      const next = slugClashResults.shift() ?? [];
      return Promise.resolve({ data: next, error: null });
    }
    return Promise.resolve({ data: recentRows, error: null });
  });
  const insertMock = jest.fn((rows: Array<Record<string, unknown>>) => {
    insertedRows.push(...rows);
    return Promise.resolve({ error: null });
  });
  chain['insert'] = insertMock;
  state.tables['posts'] = chain;

  // n8n_webhook_logs: insert terminal inocuo.
  const logChain = makeChain();
  logChain['insert'] = jest.fn().mockResolvedValue({ error: null });
  state.tables['n8n_webhook_logs'] = logChain;

  return { insertedRows, insertMock };
}

beforeEach(() => {
  jest.clearAllMocks();
  getDbState().tables = {};
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/cron/generate-blog — auth', () => {
  it('sin x-cron-secret → 401', async () => {
    setupPosts();
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(401);
  });

  it('secreto incorrecto → 401', async () => {
    setupPosts();
    const res = await POST(makeRequest('otro-secreto'));
    expect(res.status).toBe(401);
  });

  it('sin CRON_SECRET configurado → 503', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest(SECRET));
    expect(res.status).toBe(503);
  });
});

describe('POST /api/cron/generate-blog — idempotencia y dedup', () => {
  it('ya hay post de hoy → 200 skipped, no genera ni inserta', async () => {
    const { insertMock } = setupPosts({
      recentRows: [{ title: 'Post de hoy', created_at: new Date().toISOString() }],
    });
    const res = await POST(makeRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(getGenerateMock()).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('los títulos de los últimos 7 días se pasan al generador', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    setupPosts({ recentRows: [{ title: 'Tema de ayer', created_at: yesterday }] });
    getGenerateMock().mockResolvedValue(validDraft());

    await POST(makeRequest(SECRET));

    expect(getGenerateMock()).toHaveBeenCalledWith(['Tema de ayer']);
  });
});

describe('POST /api/cron/generate-blog — guardarraíl', () => {
  it('generador devuelve null → 422 y no inserta', async () => {
    const { insertMock } = setupPosts();
    getGenerateMock().mockResolvedValue(null);

    const res = await POST(makeRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.published).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('draft con content corto → 422 y no inserta (validación en la ruta)', async () => {
    const { insertMock } = setupPosts();
    getGenerateMock().mockResolvedValue(validDraft({ content: 'Demasiado corto.\n\nSí.\n\nMucho.' }));

    const res = await POST(makeRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.published).toBe(false);
    expect(body.reason).toContain('content');
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/generate-blog — publicación', () => {
  it('draft válido → 200 published e inserta is_published=true', async () => {
    const { insertedRows } = setupPosts();
    const draft = validDraft();
    getGenerateMock().mockResolvedValue(draft);

    const res = await POST(makeRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ published: true, slug: draft.slug, title: draft.title });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      slug: draft.slug,
      is_published: true,
      cover_image: null,
      seo_title: draft.seo_title,
    });
  });

  it('colisión de slug → sufija -2', async () => {
    const { insertedRows } = setupPosts({
      slugClashResults: [[{ id: 'ya-existe' }], []],
    });
    const draft = validDraft();
    getGenerateMock().mockResolvedValue(draft);

    const res = await POST(makeRequest(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe(`${draft.slug}-2`);
    expect(insertedRows[0].slug).toBe(`${draft.slug}-2`);
  });
});
