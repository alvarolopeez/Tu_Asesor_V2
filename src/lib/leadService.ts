import { supabase } from './supabase'
import { normalizeEsPhone } from './phone'
import type { LeadType } from '@/types'

/**
 * Servicio centralizado de gestión de leads.
 *
 * Reglas de negocio:
 * - Si el lead ya existe (por teléfono NORMALIZADO a E.164), NO se duplica.
 *   Brief #008 T1: antes se comparaba el crudo (`666...` vs `+34666...` no
 *   matcheaban → duplicados; y con el UNIQUE INDEX leads_phone_unique el
 *   mismo formato repetido daba 23505 visible al usuario).
 * - Si no existe, se registra con el phone normalizado.
 * - Race 23505 (dos envíos simultáneos): retry del SELECT y reutilización.
 * - Los cálculos se vinculan al lead existente o al nuevo
 *
 * CREADO EN: Code Review Session (Mayo 2026)
 * USADO POR: plusvalia/page.tsx, rentabilidad/page.tsx
 */

interface LeadSubmitData {
  name: string
  phone: string
  type: LeadType
  source: string
}

interface CalcSubmitData {
  tool_type: string
  inputs: Record<string, unknown>
  results: Record<string, unknown>
}

interface SubmitResult {
  success: boolean
  leadId: string | null
  isExisting: boolean
  error?: string
}

/**
 * Registra o reutiliza un lead y guarda el cálculo asociado.
 * 
 * Flujo:
 * 1. Busca lead existente por teléfono
 * 2. Si existe → reutiliza su ID (no inserta duplicado)
 * 3. Si no existe → crea lead nuevo
 * 4. Guarda el cálculo vinculado al lead
 */
export async function submitLeadWithCalculation(
  leadData: LeadSubmitData,
  calcData: CalcSubmitData
): Promise<SubmitResult> {
  try {
    let leadId: string | null = null
    let isExisting = false

    // 0. Normalizar SIEMPRE antes de buscar y de insertar (Brief #008 T1).
    const normalizedPhone = normalizeEsPhone(leadData.phone)

    const findByPhone = async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', normalizedPhone)
        .limit(1)
      if (error) {
        console.warn('Error buscando lead existente:', error.message)
        return null
      }
      return data && data.length > 0 ? data[0].id : null
    }

    // 1. Buscar si ya existe un lead con ese teléfono
    const existingId = await findByPhone()

    if (existingId) {
      // Lead ya existe → reutilizar
      leadId = existingId
      isExisting = true
    } else {
      // Lead no existe → crear nuevo
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert([{
          name: leadData.name.trim(),
          phone: normalizedPhone,
          type: leadData.type,
          source: leadData.source,
          status: 'new'
        }])
        .select('id')
        .single()

      if (insertError) {
        // Race con el UNIQUE INDEX leads_phone_unique (dos envíos casi
        // simultáneos): reintentar el SELECT y reutilizar el existente.
        // Mismo patrón que findOrCreateLead en el webhook de WhatsApp.
        if ((insertError as { code?: string }).code === '23505') {
          const retryId = await findByPhone()
          if (retryId) {
            leadId = retryId
            isExisting = true
          }
        }
        if (!leadId) {
          console.error('Error creando lead:', insertError)
          return {
            success: false,
            leadId: null,
            isExisting: false,
            error: `Error al registrar tus datos: ${insertError.message}`
          }
        }
      } else {
        leadId = newLead.id
      }
    }

    // 2. Guardar el cálculo vinculado al lead
    const { error: calcError } = await supabase
      .from('tool_calculations')
      .insert([{
        lead_id: leadId,
        tool_type: calcData.tool_type,
        inputs: calcData.inputs,
        results: calcData.results
      }])

    if (calcError) {
      console.error('Error guardando cálculo:', calcError)
      // El lead ya se guardó, no es crítico si falla el cálculo
    }

    return {
      success: true,
      leadId,
      isExisting
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Error inesperado en submitLeadWithCalculation:', message)
    return {
      success: false,
      leadId: null,
      isExisting: false,
      error: message
    }
  }
}

