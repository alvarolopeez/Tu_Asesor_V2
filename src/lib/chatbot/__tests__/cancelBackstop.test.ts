/**
 * Tests para el backstop regex de cancel_visit — T1 Brief #006
 *
 * El backstop en engine.ts funciona así:
 *   if (CANCEL_BACKSTOP_REGEX.test(input.message) && result.intent !== 'cancel_visit')
 *     result.intent = 'cancel_visit'
 *
 * Estos tests verifican que la regex matchea los positivos correctos y NO matchea
 * los negativos. IMPORTANTE: si cambias la regex en engine.ts, actualiza también
 * la de este archivo (busca "CANCEL_BACKSTOP_REGEX" en ambos).
 */

// Réplica de la regex en engine.ts (T1 Brief #006)
// Mantener en sync con src/lib/chatbot/engine.ts
const CANCEL_BACKSTOP_REGEX =
  /\b(cancel(ar|a|o)|anul(ar|a|o)|elimin(ar|a|o)|borr(ar|a|o)\s+(la\s+)?(cita|visita)|no\s+voy\s+a\s+(poder\s+)?ir|ya\s+no\s+(puedo|voy)|no\s+puedo\s+ir)/i;

/** Simula exactamente la lógica del backstop en engine.ts */
function applyBackstop(message: string, llmIntent: string): string {
  if (CANCEL_BACKSTOP_REGEX.test(message) && llmIntent !== 'cancel_visit') {
    return 'cancel_visit';
  }
  return llmIntent;
}

describe('CANCEL_BACKSTOP_REGEX — T1 Brief #006', () => {
  // ── Casos positivos: el backstop DEBE forzar cancel_visit ───────────────

  it('1. "Quiero cancelar la visita al piso" + LLM=schedule_visit → cancel_visit', () => {
    expect(applyBackstop('Quiero cancelar la visita al piso', 'schedule_visit')).toBe(
      'cancel_visit',
    );
  });

  it('2. "No voy a poder ir" + LLM=ESCALATE → cancel_visit', () => {
    expect(applyBackstop('No voy a poder ir', 'ESCALATE')).toBe('cancel_visit');
  });

  it('5. "Anula la cita del miércoles" + LLM=general_inquiry → cancel_visit', () => {
    expect(applyBackstop('Anula la cita del miércoles', 'general_inquiry')).toBe('cancel_visit');
  });

  it('extra. "Cancela mejor" + LLM=schedule_visit → cancel_visit (caso real del test E2E)', () => {
    expect(applyBackstop('No cancela mejor', 'schedule_visit')).toBe('cancel_visit');
  });

  it('extra. "Quiero cancelar la cita que hemos agendado para el miércoles a las 14" → cancel_visit', () => {
    expect(
      applyBackstop(
        'Quiero cancelar la cita que hemos agendado para el miércoles a las 14',
        'schedule_visit',
      ),
    ).toBe('cancel_visit');
  });

  // ── Casos negativos: el backstop NO debe tocar el intent ────────────────

  it('3. "Cambia la hora a las 16h" + LLM=schedule_visit → sigue schedule_visit', () => {
    expect(applyBackstop('Cambia la hora a las 16h', 'schedule_visit')).toBe('schedule_visit');
  });

  it('4. "Quiero ver el piso el viernes" + LLM=schedule_visit → sigue schedule_visit', () => {
    expect(applyBackstop('Quiero ver el piso el viernes', 'schedule_visit')).toBe(
      'schedule_visit',
    );
  });

  it('negativo. "Pásame la cita al jueves" → no matchea (es reagendar)', () => {
    expect(applyBackstop('Pásame la cita al jueves', 'schedule_visit')).toBe('schedule_visit');
  });

  it('negativo. "Prefiero ir otro día" → no matchea (ambiguo, no cancela)', () => {
    expect(applyBackstop('Prefiero ir otro día', 'schedule_visit')).toBe('schedule_visit');
  });

  it('guard. Si LLM ya devolvió cancel_visit → backstop no lo toca (evita doble log)', () => {
    expect(applyBackstop('Quiero cancelar mi visita', 'cancel_visit')).toBe('cancel_visit');
  });
});
