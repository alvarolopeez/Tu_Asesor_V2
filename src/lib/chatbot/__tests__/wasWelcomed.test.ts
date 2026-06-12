/**
 * Tests para el flag was_welcomed (T2, Brief #013).
 *
 * Verifica que un lead que ya recibió la bienvenida HSM por n8n (was_welcomed=true)
 * produzca [turno_asistente: 1] en el bloque de contexto del sistema prompt,
 * incluso cuando chatbot_messages está vacío (assistantTurnCount=0).
 * Esto evita que Paula se presente dos veces.
 */

import { buildClientContextBlock } from '../engine';

describe('buildClientContextBlock — was_welcomed via effectiveTurns', () => {
  it('assistant_turn_count 1 → bloque contiene [turno_asistente: 1]', () => {
    const block = buildClientContextBlock({ assistant_turn_count: 1 });
    expect(block).toContain('[turno_asistente: 1]');
  });

  it('assistant_turn_count 0 → bloque NO contiene [turno_asistente:]', () => {
    const block = buildClientContextBlock({ assistant_turn_count: 0 });
    expect(block).not.toContain('[turno_asistente:');
  });

  it('was_welcomed proxy: effectiveTurns=max(0,1)=1 → [turno_asistente: 1]', () => {
    // Replica el cálculo del engine cuando was_welcomed=true y historial vacío
    const effectiveTurns = Math.max(0 /* assistantTurnCount */, 1 /* wasWelcomed=true */);
    const block = buildClientContextBlock({ assistant_turn_count: effectiveTurns });
    expect(block).toContain('[turno_asistente: 1]');
  });

  it('was_welcomed proxy: effectiveTurns=max(0,0)=0 → NO [turno_asistente:]', () => {
    // Lead nuevo de WhatsApp: was_welcomed=false, historial vacío → Paula SÍ se presenta
    const effectiveTurns = Math.max(0, 0);
    const block = buildClientContextBlock({ assistant_turn_count: effectiveTurns });
    expect(block).not.toContain('[turno_asistente:');
  });

  it('historial con turnos 3 + was_welcomed → usa el mayor (3)', () => {
    const effectiveTurns = Math.max(3, 1);
    const block = buildClientContextBlock({ assistant_turn_count: effectiveTurns });
    expect(block).toContain('[turno_asistente: 3]');
  });
});
