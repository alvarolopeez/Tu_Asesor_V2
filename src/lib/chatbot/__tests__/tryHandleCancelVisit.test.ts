/**
 * Tests para tryHandleCancelVisit — Brief #005 T3
 *
 * Estrategia: mocks por tabla de Supabase (from('tabla') → chain específico).
 * Todo construido dentro del factory de jest.mock para evitar TDZ con ts-jest.
 */

import { tryHandleCancelVisit } from '../scheduling';
import type { CancelHookInput } from '../scheduling';

// ─── Supabase mock ─────────────────────────────────────────────────────────
// Construimos el chain DENTRO del factory (sin variables externas → evita TDZ).

jest.mock('@supabase/supabase-js', () => {
  // Función que crea un chain fluido con todos los métodos Supabase típicos.
  function makeChain(terminalValues?: Record<string, unknown>): Record<string, jest.Mock> {
    const c: Record<string, jest.Mock> = {};
    ['select', 'eq', 'single', 'limit', 'order', 'gte', 'update', 'insert'].forEach((m) => {
      c[m] = jest.fn().mockReturnValue(c);
    });
    if (terminalValues) {
      Object.entries(terminalValues).forEach(([method, value]) => {
        c[method].mockResolvedValue(value);
      });
    }
    return c;
  }

  // Estado mutable que los tests configuran vía resetDbMocks().
  const state: { tables: Record<string, Record<string, jest.Mock>> } = { tables: {} };

  return {
    createClient: jest.fn(() => ({
      from: jest.fn((table: string) => {
        return state.tables[table] ?? makeChain();
      }),
      _state: state, // expuesto para configuración en tests
    })),
    _makeChain: makeChain, // helper expuesto
  };
});

// Whatsapp mock
jest.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue(true),
  sendWhatsAppTemplate: jest.fn().mockResolvedValue(true),
  markWhatsAppRead: jest.fn().mockResolvedValue(true),
}));

// LLM parser mock
jest.mock('../llmParser', () => ({
  parseWithLLM: jest.fn(),
  rescueNaturalResponse: jest.fn(),
}));

// ─── Acceso a mocks ────────────────────────────────────────────────────────

function getDbState(): { tables: Record<string, Record<string, jest.Mock>> } {
  const { createClient } = jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock };
  return createClient()._state;
}

function getMakeChain(): (t?: Record<string, unknown>) => Record<string, jest.Mock> {
  return (jest.requireMock('@supabase/supabase-js') as { _makeChain: Function })
    ._makeChain as (t?: Record<string, unknown>) => Record<string, jest.Mock>;
}

function getSendWhatsAppMessage(): jest.Mock {
  return (jest.requireMock('@/lib/whatsapp') as { sendWhatsAppMessage: jest.Mock })
    .sendWhatsAppMessage;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const LEAD_ID = 'lead-uuid-001';
const CONV_ID = 'conv-uuid-001';
const APT_ID = 'apt-uuid-001';
const ADVISOR_PHONE = '34697223944'; // ADVISOR_WHATSAPP_PHONE env var

function futureApt(overrides: Record<string, unknown> = {}) {
  return {
    id: APT_ID,
    scheduled_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    property_id: 'prop-001',
    title: 'Visita: Calle Goya 12',
    status: 'pending',
    ...overrides,
  };
}

function makeInput(overrides: Partial<CancelHookInput> = {}): CancelHookInput {
  return {
    conversationId: CONV_ID,
    userMessage: 'cancela mi cita',
    intent: 'cancel_visit',
    leadPhone: '+34600000001',
    leadName: 'Test User',
    extracted: { name: null, phone: null, preferred_date: null, property_interest: null },
    ...overrides,
  };
}

/**
 * Configura los mocks de Supabase por tabla para un escenario concreto.
 *
 * Flujo de queries en tryHandleCancelVisit (en orden):
 *   chatbot_conversations.select().eq().single()  → metadata (getConversationMetadata)
 *   chatbot_conversations.select().eq().single()  → lead_id (getLeadIdFromConversation)
 *   appointments.select().eq().eq().gte()         → recentCancels (countRecentCancellations)
 *   appointments.select().eq().eq().gte().order().limit() → future apts
 *   chatbot_conversations.update().eq()           → setConversationMetadata (guardar cancel_flow)
 *   [si cancel done]:
 *     appointments.update().eq().eq()            → ejecutar cancel
 *     leads.select().eq().single()               → notifyAdvisorOfCancellation
 */
function setupMocks({
  metadata = {} as Record<string, unknown>,
  leadId = LEAD_ID as string | null,
  recentCancels = [] as unknown[],
  appointments = [futureApt()] as unknown[],
} = {}) {
  const state = getDbState();
  const makeChain = getMakeChain();

  // ── chatbot_conversations ──────────────────────────────────────────────
  // Necesita: 2x single (metadata, lead_id) + update fluent
  {
    let singleCount = 0;
    const chain = makeChain();
    chain['select'].mockReturnValue(chain);
    chain['eq'].mockReturnValue(chain);
    chain['single'].mockImplementation(() => {
      singleCount++;
      if (singleCount === 1)
        return Promise.resolve({ data: { metadata, lead_id: leadId, wa_phone_number: null } });
      return Promise.resolve({ data: { lead_id: leadId } });
    });
    // update().eq() → { error: null }
    chain['update'].mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    state.tables['chatbot_conversations'] = chain;
  }

  // ── appointments ───────────────────────────────────────────────────────
  // Necesita: gte (terminal countRecentCancellations) + limit (terminal future)
  // + update (ejecutar cancel)
  {
    let gteCount = 0;
    const chain = makeChain();
    chain['select'].mockReturnValue(chain);
    chain['eq'].mockReturnValue(chain);
    chain['order'].mockReturnValue(chain);
    chain['gte'].mockImplementation(() => {
      gteCount++;
      if (gteCount === 1) return Promise.resolve({ data: recentCancels }); // countRecentCancellations
      return chain; // intermediate gte (future apts query sigue con .order().limit())
    });
    chain['limit'].mockResolvedValue({ data: appointments });
    // update().eq().eq() → { error: null }
    chain['update'].mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    state.tables['appointments'] = chain;
  }

  // ── leads ──────────────────────────────────────────────────────────────
  // Necesita: select().eq().single() → lead data (para notifyAdvisorOfCancellation)
  {
    const chain = makeChain();
    chain['select'].mockReturnValue(chain);
    chain['eq'].mockReturnValue(chain);
    chain['single'].mockResolvedValue({ data: { name: 'Test User', phone: '+34600000001' } });
    state.tables['leads'] = chain;
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADVISOR_WHATSAPP_PHONE = ADVISOR_PHONE;
});

afterEach(() => {
  delete process.env.ADVISOR_WHATSAPP_PHONE;
});

describe('tryHandleCancelVisit', () => {

  // ── 1. Lead sin citas futuras ────────────────────────────────────────────

  it('1. Lead sin citas futuras → respuesta amistosa, no escala', async () => {
    setupMocks({ appointments: [] });
    const result = await tryHandleCancelVisit(makeInput());
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_none');
    expect(result!.shouldEscalate).toBe(false);
    expect(result!.response).toMatch(/no encuentro ninguna visita/i);
  });

  // ── 2. Visita a >4h → FASE A: ofrece reagendar ───────────────────────────

  it('2. Visita a >4h → FASE A ofrece reagendar/cancelar, no escala', async () => {
    setupMocks(); // appointment +24h por defecto
    const result = await tryHandleCancelVisit(makeInput());
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_offered_reschedule');
    expect(result!.shouldEscalate).toBe(false);
    expect(result!.response).toMatch(/reagendar|cancelar/i);
  });

  // ── 3. Visita a <4h → escala ─────────────────────────────────────────────

  it('3. Visita a <4h → escala con shouldEscalate=true', async () => {
    const closeApt = futureApt({
      scheduled_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    });
    setupMocks({ appointments: [closeApt] });
    const result = await tryHandleCancelVisit(makeInput());
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_too_close');
    expect(result!.shouldEscalate).toBe(true);
    expect(result!.response).toMatch(/menos de 4 horas/i);
  });

  // ── 4. Usuario elige reagendar → devuelve null ────────────────────────────

  it('4. Usuario responde "reagendar" con cancel_flow activo → null (delega a schedule flow)', async () => {
    const meta = { cancel_flow: { step: 'offered_reschedule', appointmentId: APT_ID } };
    setupMocks({ metadata: meta });
    const result = await tryHandleCancelVisit(
      makeInput({ userMessage: 'prefiero reagendar a otro día', intent: 'general_inquiry' }),
    );
    expect(result).toBeNull();
  });

  // ── 5. Usuario elige "cancelar" → avanza a awaiting_confirm ──────────────

  it('5. Usuario elige "cancelarla" → avanza a awaiting_confirm', async () => {
    const meta = { cancel_flow: { step: 'offered_reschedule', appointmentId: APT_ID } };
    setupMocks({ metadata: meta });
    const result = await tryHandleCancelVisit(
      makeInput({ userMessage: 'cancelarla del todo', intent: 'cancel_visit' }),
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_awaiting_confirm');
    expect(result!.shouldEscalate).toBe(false);
  });

  // ── 6. Usuario confirma con motivo → cancel_visit_done ───────────────────

  it('6. Usuario confirma en awaiting_confirm → cancel_visit_done', async () => {
    const meta = { cancel_flow: { step: 'awaiting_confirm', appointmentId: APT_ID } };
    setupMocks({ metadata: meta });
    const result = await tryHandleCancelVisit(
      makeInput({ userMessage: 'no puedo, trabajo ese día', intent: 'general_inquiry' }),
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_done');
    expect(result!.shouldEscalate).toBe(false);
    expect(result!.response).toMatch(/cancelado/i);
  });

  // ── 7. Rate limit (≥3 cancels en 24h) → escala ───────────────────────────

  it('7. Rate limit 3+ cancels en 24h → escala y notifica al asesor', async () => {
    setupMocks({ recentCancels: [{ id: '1' }, { id: '2' }, { id: '3' }] });
    const result = await tryHandleCancelVisit(makeInput());
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('cancel_visit_rate_limited');
    expect(result!.shouldEscalate).toBe(true);
    expect(getSendWhatsAppMessage()).toHaveBeenCalled();
  });

  // ── 8. Intent incorrecto sin cancel_flow → null ───────────────────────────

  it('8. Intent no-cancel sin cancel_flow activo → null (no intercepta chat normal)', async () => {
    setupMocks({ metadata: {} });
    const result = await tryHandleCancelVisit(
      makeInput({ intent: 'general_inquiry', userMessage: 'hola, ¿qué tal?' }),
    );
    expect(result).toBeNull();
  });
});
