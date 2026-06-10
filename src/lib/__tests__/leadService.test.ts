/**
 * Tests para submitLeadWithCalculation — Brief #008 T1.
 *
 * Mock de '@/lib/supabase' (leadService importa el cliente compartido, no
 * createClient directamente). Estado configurable por tabla.
 */

import { submitLeadWithCalculation } from '../leadService';

jest.mock('../supabase', () => {
  const state: {
    selectResults: Array<{ data: unknown[] | null; error: { message: string } | null }>;
    insertResult: { data: { id: string } | null; error: { code?: string; message: string } | null };
    insertedLeadRows: unknown[];
    calcRows: unknown[];
  } = {
    selectResults: [],
    insertResult: { data: { id: 'new-lead-id' }, error: null },
    insertedLeadRows: [],
    calcRows: [],
  };

  const leadsChain = {
    select: jest.fn(),
    eq: jest.fn(),
    limit: jest.fn(),
    insert: jest.fn(),
    single: jest.fn(),
  };
  leadsChain.select.mockReturnValue(leadsChain);
  leadsChain.eq.mockReturnValue(leadsChain);
  leadsChain.limit.mockImplementation(() =>
    Promise.resolve(state.selectResults.shift() ?? { data: [], error: null }),
  );
  leadsChain.insert.mockImplementation((rows: unknown[]) => {
    state.insertedLeadRows.push(...rows);
    return leadsChain;
  });
  leadsChain.single.mockImplementation(() => Promise.resolve(state.insertResult));

  const calcChain = {
    insert: jest.fn((rows: unknown[]) => {
      state.calcRows.push(...rows);
      return Promise.resolve({ error: null });
    }),
  };

  return {
    supabase: {
      from: jest.fn((table: string) => (table === 'leads' ? leadsChain : calcChain)),
    },
    _state: state,
    _leadsChain: leadsChain,
  };
});

type MockState = {
  selectResults: Array<{ data: unknown[] | null; error: { message: string } | null }>;
  insertResult: { data: { id: string } | null; error: { code?: string; message: string } | null };
  insertedLeadRows: Array<Record<string, unknown>>;
  calcRows: Array<Record<string, unknown>>;
};

function getState(): MockState {
  return (jest.requireMock('../supabase') as { _state: MockState })._state;
}

const LEAD = { name: 'Test', phone: '666 11 22 33', type: 'buyer' as const, source: 'Calculadora' };
const CALC = { tool_type: 'rentabilidad', inputs: {}, results: {} };

beforeEach(() => {
  jest.clearAllMocks();
  const s = getState();
  s.selectResults = [];
  s.insertResult = { data: { id: 'new-lead-id' }, error: null };
  s.insertedLeadRows = [];
  s.calcRows = [];
});

describe('submitLeadWithCalculation — normalización', () => {
  it('busca e inserta con el phone normalizado a E.164', async () => {
    const s = getState();
    s.selectResults = [{ data: [], error: null }];

    const res = await submitLeadWithCalculation(LEAD, CALC);

    expect(res.success).toBe(true);
    expect(res.isExisting).toBe(false);
    expect(s.insertedLeadRows[0].phone).toBe('+34666112233');
  });

  it('phone en formato +34 reutiliza el lead creado con formato local (1 solo lead)', async () => {
    const s = getState();
    // El SELECT por '+34666112233' encuentra el lead existente.
    s.selectResults = [{ data: [{ id: 'existing-id' }], error: null }];

    const res = await submitLeadWithCalculation({ ...LEAD, phone: '+34 666 112 233' }, CALC);

    expect(res.success).toBe(true);
    expect(res.isExisting).toBe(true);
    expect(res.leadId).toBe('existing-id');
    expect(s.insertedLeadRows).toHaveLength(0);
    // El cálculo se vincula al lead existente.
    expect(s.calcRows[0].lead_id).toBe('existing-id');
  });
});

describe('submitLeadWithCalculation — race 23505', () => {
  it('insert con 23505 → retry del SELECT y reutiliza el existente', async () => {
    const s = getState();
    // 1er SELECT: vacío (todavía no existe). Tras el 23505, el retry lo encuentra.
    s.selectResults = [
      { data: [], error: null },
      { data: [{ id: 'raced-id' }], error: null },
    ];
    s.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };

    const res = await submitLeadWithCalculation(LEAD, CALC);

    expect(res.success).toBe(true);
    expect(res.isExisting).toBe(true);
    expect(res.leadId).toBe('raced-id');
    expect(s.calcRows[0].lead_id).toBe('raced-id');
  });

  it('insert con error NO-23505 → devuelve error sin retry', async () => {
    const s = getState();
    s.selectResults = [{ data: [], error: null }];
    s.insertResult = { data: null, error: { code: '42501', message: 'permission denied' } };

    const res = await submitLeadWithCalculation(LEAD, CALC);

    expect(res.success).toBe(false);
    expect(res.leadId).toBeNull();
    expect(res.error).toContain('permission denied');
  });

  it('23505 pero el retry tampoco encuentra → devuelve error', async () => {
    const s = getState();
    s.selectResults = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    s.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };

    const res = await submitLeadWithCalculation(LEAD, CALC);

    expect(res.success).toBe(false);
    expect(res.leadId).toBeNull();
  });
});
