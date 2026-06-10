/**
 * Tests para finalizeScheduling (vía handleInterviewStep) y
 * startInterviewFromWebBooking — FIX cita duplicada Brief #007.
 *
 * Bug: startInterviewFromWebBooking creaba interview_state SIN mode; al
 * completar la entrevista, finalizeScheduling caía en la rama pre_schedule
 * e insertaba una SEGUNDA cita idéntica a la ya creada por
 * bookPublicAppointment. El fix introduce mode='web_booking' que salta el
 * INSERT pero conserva upsertBuyerDemand + funnel + aviso al asesor.
 *
 * Estrategia: mocks por tabla de Supabase (from('tabla') → chain específico),
 * todo construido dentro del factory de jest.mock para evitar TDZ con ts-jest.
 */

import { handleInterviewStep, startInterviewFromWebBooking } from '../scheduling';
import type { InterviewState } from '../scheduling';

// ─── Supabase mock ─────────────────────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => {
  function makeChain(terminalValues?: Record<string, unknown>): Record<string, jest.Mock> {
    const c: Record<string, jest.Mock> = {};
    ['select', 'eq', 'single', 'limit', 'order', 'gte', 'lt', 'in', 'neq', 'update', 'insert'].forEach((m) => {
      c[m] = jest.fn().mockReturnValue(c);
    });
    if (terminalValues) {
      Object.entries(terminalValues).forEach(([method, value]) => {
        c[method].mockResolvedValue(value);
      });
    }
    return c;
  }

  const state: { tables: Record<string, Record<string, jest.Mock>> } = { tables: {} };

  return {
    createClient: jest.fn(() => ({
      from: jest.fn((table: string) => {
        return state.tables[table] ?? makeChain();
      }),
      _state: state,
    })),
    _makeChain: makeChain,
  };
});

// Whatsapp mock
jest.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue(true),
  sendWhatsAppTemplate: jest.fn().mockResolvedValue(true),
  markWhatsAppRead: jest.fn().mockResolvedValue(true),
}));

// LLM parser mock (la respuesta "para vivir yo" la resuelve el regex, sin LLM)
jest.mock('../llmParser', () => ({
  parseWithLLM: jest.fn().mockResolvedValue(null),
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

function getSendWhatsAppTemplate(): jest.Mock {
  return (jest.requireMock('@/lib/whatsapp') as { sendWhatsAppTemplate: jest.Mock })
    .sendWhatsAppTemplate;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const LEAD_ID = 'lead-uuid-001';
const CONV_ID = 'conv-uuid-001';
const PROP_ID = 'prop-uuid-001';
const PROPERTY_PRICE = 150_000;

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    step: 3,
    answers: { savings: 30_000, funding: 'Preconcedida' },
    attempts: 0,
    target: {
      propertyId: PROP_ID,
      propertyTitle: 'Piso en Calle Goya 12',
      propertyZone: 'Utrera, Sevilla',
      scheduledAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      leadId: LEAD_ID,
      leadName: 'Test User',
      leadPhone: '+34600000001',
    },
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Configura los mocks de Supabase por tabla.
 *
 * Tablas que toca finalizeScheduling (rama no-standalone):
 *   appointments.insert()                          → crear cita (solo pre_schedule)
 *   properties.select('price').eq().single()       → max_budget real
 *   buyers_demands.select().eq().limit()           → ¿demand existente?
 *   buyers_demands.insert() / .update().eq()       → upsert demand
 *   leads.select().eq().single() + update().eq()   → advanceLeadStatus / setVisitScheduled
 *   chatbot_conversations select/update            → clearInterviewState + setSchedulingHint
 *
 * startInterviewFromWebBooking añade:
 *   chatbot_conversations ... .limit()             → convo whatsapp activa
 *   chatbot_messages.insert()                      → push del bot en BD
 */
function setupMocks({
  existingDemand = [] as unknown[],
  activeConvo = [{ id: CONV_ID, metadata: {}, lead_id: LEAD_ID }] as unknown[],
} = {}) {
  const state = getDbState();
  const makeChain = getMakeChain();

  // ── appointments ───────────────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['insert'].mockResolvedValue({ error: null });
    state.tables['appointments'] = chain;
  }

  // ── properties ─────────────────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['single'].mockResolvedValue({ data: { price: PROPERTY_PRICE } });
    state.tables['properties'] = chain;
  }

  // ── buyers_demands ─────────────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['limit'].mockResolvedValue({ data: existingDemand });
    chain['insert'].mockResolvedValue({ error: null });
    chain['update'].mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    state.tables['buyers_demands'] = chain;
  }

  // ── leads ──────────────────────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['single'].mockResolvedValue({ data: { status: 'new', preferences: {} }, error: null });
    chain['update'].mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    state.tables['leads'] = chain;
  }

  // ── chatbot_conversations ──────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['limit'].mockResolvedValue({ data: activeConvo });
    chain['single'].mockResolvedValue({
      data: { metadata: {}, lead_id: LEAD_ID, wa_phone_number: '+34600000001' },
    });
    chain['update'].mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    state.tables['chatbot_conversations'] = chain;
  }

  // ── chatbot_messages ───────────────────────────────────────────────────
  {
    const chain = makeChain();
    chain['insert'].mockResolvedValue({ error: null });
    state.tables['chatbot_messages'] = chain;
  }

  return state;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('startInterviewFromWebBooking', () => {
  it('marca el interview_state con mode=web_booking (la cita ya existe)', async () => {
    const state = setupMocks();
    const outcome = await startInterviewFromWebBooking({
      phone: '+34600000001',
      leadName: 'Test User',
      leadId: LEAD_ID,
      propertyId: PROP_ID,
      propertyTitle: 'Piso en Calle Goya 12',
      propertyZone: 'Utrera, Sevilla',
      scheduledAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    });

    expect(outcome.kind).toBe('started');

    const updateMock = state.tables['chatbot_conversations']['update'];
    expect(updateMock).toHaveBeenCalled();
    const savedState = updateMock.mock.calls
      .map((call) => call[0]?.metadata?.interview_state)
      .find((s) => s != null) as InterviewState | undefined;
    expect(savedState).toBeDefined();
    expect(savedState!.mode).toBe('web_booking');
    expect(savedState!.step).toBe(1);
    expect(savedState!.target.leadId).toBe(LEAD_ID);
  });
});

describe('finalizeScheduling vía handleInterviewStep (paso 3)', () => {
  const userMessage = 'para vivir yo con mi familia';

  it('mode=web_booking → NO inserta appointment (la creó bookPublicAppointment)', async () => {
    const state = setupMocks();
    const result = await handleInterviewStep(
      makeState({ mode: 'web_booking' }),
      userMessage,
      CONV_ID,
    );

    // Lo crítico del fix: cero INSERTs en appointments.
    expect(state.tables['appointments']['insert']).not.toHaveBeenCalled();

    // Pero el resto del cierre se conserva: demand con presupuesto real…
    const demandInsert = state.tables['buyers_demands']['insert'];
    expect(demandInsert).toHaveBeenCalledTimes(1);
    expect(demandInsert.mock.calls[0][0][0]).toMatchObject({
      phone: '+34600000001',
      max_budget: PROPERTY_PRICE,
      savings_contribution: 30_000,
    });

    // …funnel del lead (advanceLeadStatus + setVisitScheduled actualizan leads)…
    expect(state.tables['leads']['update']).toHaveBeenCalled();

    // …aviso al asesor con el título de perfil (no "Nueva cita")…
    const tpl = getSendWhatsAppTemplate();
    expect(tpl).toHaveBeenCalled();
    expect(tpl.mock.calls[0][2][0]).toMatch(/perfil completado tras reserva web/i);

    // …y confirmación al cliente sin escalar.
    expect(result.intent).toBe('schedule_visit_confirmed');
    expect(result.shouldEscalate).toBe(false);
  });

  it('mode ausente (pre_schedule, flujo chatbot) → SÍ inserta exactamente 1 appointment', async () => {
    const state = setupMocks();
    const result = await handleInterviewStep(makeState(), userMessage, CONV_ID);

    const apptInsert = state.tables['appointments']['insert'];
    expect(apptInsert).toHaveBeenCalledTimes(1);
    expect(apptInsert.mock.calls[0][0][0]).toMatchObject({
      lead_id: LEAD_ID,
      property_id: PROP_ID,
      status: 'pending',
      type: 'visita',
    });
    expect(result.intent).toBe('schedule_visit_confirmed');
  });

  it('mode=standalone → NO inserta appointment (regresión T4)', async () => {
    const state = setupMocks();
    const result = await handleInterviewStep(
      makeState({ mode: 'standalone' }),
      userMessage,
      CONV_ID,
    );

    expect(state.tables['appointments']['insert']).not.toHaveBeenCalled();
    expect(result.intent).toBe('schedule_visit_confirmed');
  });
});
