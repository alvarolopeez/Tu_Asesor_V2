/**
 * Tests para leadFunnel — Brief #007 T1.2
 *
 * Estrategia: mocks por tabla de Supabase (from('tabla') → chain específico),
 * mismo patrón que tryHandleCancelVisit.test.ts. Todo construido dentro del
 * factory de jest.mock para evitar TDZ con ts-jest.
 */

import { advanceLeadStatus, setVisitScheduled, revertVisitStatus } from '../leadFunnel';

// ─── Supabase mock ─────────────────────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => {
  function makeChain(): Record<string, jest.Mock> {
    const c: Record<string, jest.Mock> = {};
    ['select', 'eq', 'single', 'limit', 'order', 'gte', 'in', 'update', 'insert'].forEach((m) => {
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

// ─── Acceso a mocks ────────────────────────────────────────────────────────

function getDbState(): { tables: Record<string, Record<string, jest.Mock>> } {
  const { createClient } = jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock };
  return createClient()._state;
}

function getMakeChain(): () => Record<string, jest.Mock> {
  return (jest.requireMock('@supabase/supabase-js') as { _makeChain: () => Record<string, jest.Mock> })
    ._makeChain;
}

const LEAD_ID = 'lead-uuid-001';

/**
 * Configura los mocks para un escenario.
 *
 * Queries del helper (en orden):
 *   leads.select('status, preferences').eq().single() → { status, preferences }
 *   [solo revertVisitStatus]:
 *     appointments.select('id').eq().in().gte().limit() → citas activas futuras
 *   leads.update({...}).eq() → { error: null }
 */
function setupMocks({
  status = 'new' as string | null,
  preferences = {} as Record<string, unknown> | null,
  activeAppointments = [] as unknown[],
}: {
  status?: string | null;
  preferences?: Record<string, unknown> | null;
  activeAppointments?: unknown[];
} = {}): { leadUpdate: jest.Mock; leadUpdateEq: jest.Mock } {
  const state = getDbState();
  const makeChain = getMakeChain();

  // ── leads ──
  const leadUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const leadUpdate = jest.fn().mockReturnValue({ eq: leadUpdateEq });
  {
    const chain = makeChain();
    chain['single'].mockResolvedValue({ data: { status, preferences }, error: null });
    chain['update'] = leadUpdate;
    state.tables['leads'] = chain;
  }

  // ── appointments ──
  {
    const chain = makeChain();
    chain['limit'].mockResolvedValue({ data: activeAppointments, error: null });
    state.tables['appointments'] = chain;
  }

  return { leadUpdate, leadUpdateEq };
}

beforeEach(() => {
  jest.clearAllMocks();
  getDbState().tables = {};
});

// ─── advanceLeadStatus ─────────────────────────────────────────────────────

describe('advanceLeadStatus', () => {
  it('avanza new → contacted', async () => {
    const { leadUpdate } = setupMocks({ status: 'new' });
    await advanceLeadStatus(LEAD_ID, 'contacted');
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'contacted' }),
    );
  });

  it('avanza contacted → qualified', async () => {
    const { leadUpdate } = setupMocks({ status: 'contacted' });
    await advanceLeadStatus(LEAD_ID, 'qualified');
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'qualified' }),
    );
  });

  it('forward-only: qualified NO baja a contacted', async () => {
    const { leadUpdate } = setupMocks({ status: 'qualified' });
    await advanceLeadStatus(LEAD_ID, 'contacted');
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('forward-only: visit_scheduled NO baja a qualified', async () => {
    const { leadUpdate } = setupMocks({ status: 'visit_scheduled' });
    await advanceLeadStatus(LEAD_ID, 'qualified');
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('closed es intocable', async () => {
    const { leadUpdate } = setupMocks({ status: 'closed' });
    await advanceLeadStatus(LEAD_ID, 'contacted');
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('lost es intocable', async () => {
    const { leadUpdate } = setupMocks({ status: 'lost' });
    await advanceLeadStatus(LEAD_ID, 'qualified');
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('no-op si ya está en el target', async () => {
    const { leadUpdate } = setupMocks({ status: 'contacted' });
    await advanceLeadStatus(LEAD_ID, 'contacted');
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('nunca lanza si el lead no existe', async () => {
    const state = getDbState();
    const makeChain = getMakeChain();
    const chain = makeChain();
    chain['single'].mockResolvedValue({ data: null, error: { message: 'not found' } });
    state.tables['leads'] = chain;
    await expect(advanceLeadStatus(LEAD_ID, 'contacted')).resolves.toBeUndefined();
  });
});

// ─── setVisitScheduled ─────────────────────────────────────────────────────

describe('setVisitScheduled', () => {
  it('guarda el estado previo en preferences._visit_prev_status', async () => {
    const { leadUpdate } = setupMocks({ status: 'qualified', preferences: { foo: 'bar' } });
    await setVisitScheduled(LEAD_ID);
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'visit_scheduled',
        preferences: { foo: 'bar', _visit_prev_status: 'qualified' },
      }),
    );
  });

  it('guarda "new" como previo para un lead recién creado', async () => {
    const { leadUpdate } = setupMocks({ status: 'new', preferences: null });
    await setVisitScheduled(LEAD_ID);
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'visit_scheduled',
        preferences: { _visit_prev_status: 'new' },
      }),
    );
  });

  it('no-op si ya está en visit_scheduled', async () => {
    const { leadUpdate } = setupMocks({ status: 'visit_scheduled' });
    await setVisitScheduled(LEAD_ID);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('closed/lost intocables', async () => {
    const closedMocks = setupMocks({ status: 'closed' });
    await setVisitScheduled(LEAD_ID);
    expect(closedMocks.leadUpdate).not.toHaveBeenCalled();

    const lostMocks = setupMocks({ status: 'lost' });
    await setVisitScheduled(LEAD_ID);
    expect(lostMocks.leadUpdate).not.toHaveBeenCalled();
  });
});

// ─── revertVisitStatus ─────────────────────────────────────────────────────

describe('revertVisitStatus', () => {
  it('revierte al estado guardado y limpia la clave', async () => {
    const { leadUpdate } = setupMocks({
      status: 'visit_scheduled',
      preferences: { _visit_prev_status: 'qualified', foo: 'bar' },
    });
    await revertVisitStatus(LEAD_ID);
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'qualified',
        preferences: { foo: 'bar' },
      }),
    );
  });

  it('con OTRA cita activa futura NO revierte', async () => {
    const { leadUpdate } = setupMocks({
      status: 'visit_scheduled',
      preferences: { _visit_prev_status: 'qualified' },
      activeAppointments: [{ id: 'apt-2' }],
    });
    await revertVisitStatus(LEAD_ID);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('sin clave _visit_prev_status cae a contacted', async () => {
    const { leadUpdate } = setupMocks({
      status: 'visit_scheduled',
      preferences: {},
    });
    await revertVisitStatus(LEAD_ID);
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'contacted' }),
    );
  });

  it('no-op si el status actual no es visit_scheduled', async () => {
    const { leadUpdate } = setupMocks({
      status: 'contacted',
      preferences: { _visit_prev_status: 'new' },
    });
    await revertVisitStatus(LEAD_ID);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('ignora un _visit_prev_status corrupto (fuera del funnel) y cae a contacted', async () => {
    const { leadUpdate } = setupMocks({
      status: 'visit_scheduled',
      preferences: { _visit_prev_status: 'closed' },
    });
    await revertVisitStatus(LEAD_ID);
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'contacted' }),
    );
  });
});
