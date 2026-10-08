import { supabase } from "@/lib/supabase"

export interface ActivityInput {
  action: string
  entity?: string
  entityId?: string
  propertyId?: string | null
  oldValue?: unknown
  newValue?: unknown
}

/**
 * Writes a row to activity_logs. Fire-and-forget by design: logging must
 * never break or delay the action being logged, so failures are silent.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from("activity_logs").insert({
      actor_id: user.id,
      property_id: input.propertyId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
    })
  } catch {
    /* activity logging is best-effort */
  }
}

/** Human-friendly labels for the History page. */
export const ACTIVITY_LABELS: Record<string, string> = {
  tenant_added: "Tenant added",
  tenancy_started: "Tenancy started",
  tenancy_ended: "Tenancy ended",
  payment_recorded: "Payment recorded",
  rent_changed: "Rent changed",
  property_created: "Property created",
  property_shared: "Property shared",
  access_removed: "Access removed",
  flat_added: "Flat added",
  expense_recorded: "Expense recorded",
  maintenance_resolved: "Maintenance resolved",
  agreement_created: "Agreement created",
}
