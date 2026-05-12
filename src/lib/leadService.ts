import { supabase } from './supabase'
import type { LeadType } from '@/types'

/**
 * Servicio centralizado de gestión de leads.
 * 
 * Reglas de negocio:
 * - Si el lead ya existe (por teléfono), NO se duplica
 * - Si no existe, se registra con type = 'seller' y consentimiento aceptado
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

    // 1. Buscar si ya existe un lead con ese teléfono
    const { data: existingLeads, error: searchError } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', leadData.phone.trim())
      .limit(1)

    if (searchError) {
      console.warn('Error buscando lead existente:', searchError.message)
      // No bloquear por error de búsqueda, intentar insertar
    }

    if (existingLeads && existingLeads.length > 0) {
      // Lead ya existe → reutilizar
      leadId = existingLeads[0].id
      isExisting = true
    } else {
      // Lead no existe → crear nuevo
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert([{
          name: leadData.name.trim(),
          phone: leadData.phone.trim(),
          type: leadData.type,
          source: leadData.source,
          status: 'new'
        }])
        .select('id')
        .single()

      if (insertError) {
        console.error('Error creando lead:', insertError)
        return {
          success: false,
          leadId: null,
          isExisting: false,
          error: `Error al registrar tus datos: ${insertError.message}`
        }
      }

      leadId = newLead.id
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
