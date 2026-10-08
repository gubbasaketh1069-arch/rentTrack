import { useEffect, useState } from "react"
import {
  useCreateFamilyMember,
  useUpdateFamilyMember,
  type FamilyMember,
  type FamilyMemberInput,
} from "@/hooks/useTenantData"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"

interface FamilyMemberDialogProps {
  open: boolean
  onClose: () => void
  tenantId: string
  member: FamilyMember | null // null = create mode
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Add / edit a family member (spec section 12). Aadhaar is stored as
 * entered; display is always masked elsewhere in the app.
 */
export default function FamilyMemberDialog({
  open,
  onClose,
  tenantId,
  member,
}: FamilyMemberDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreateFamilyMember(tenantId)
  const updateMutation = useUpdateFamilyMember(tenantId)
  const isEdit = !!member

  const [name, setName] = useState("")
  const [relationship, setRelationship] = useState("")
  const [dob, setDob] = useState("")
  const [age, setAge] = useState("")
  const [occupation, setOccupation] = useState("")
  const [phone, setPhone] = useState("")
  const [aadhaar, setAadhaar] = useState("")
  const [joinedDate, setJoinedDate] = useState("")
  const [leftDate, setLeftDate] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(member?.name ?? "")
      setRelationship(member?.relationship ?? "")
      setDob(member?.dob ?? "")
      setAge(member?.age != null ? String(member.age) : "")
      setOccupation(member?.occupation ?? "")
      setPhone(member?.phone ?? "")
      setAadhaar(member?.aadhaar_number ?? "")
      setJoinedDate(member?.joined_date ?? todayISO())
      setLeftDate(member?.left_date ?? "")
      setNotes(member?.notes ?? "")
      setError(null)
    }
  }, [open, member])

  const saving = createMutation.isPending || updateMutation.isPending

  async function handleSave() {
    setError(null)
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    const ageNum = age.trim() === "" ? null : Number(age)
    if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 150)) {
      setError("Age must be a whole number between 0 and 150.")
      return
    }
    const input: FamilyMemberInput = {
      name: name.trim(),
      relationship: relationship.trim() || null,
      dob: dob || null,
      age: ageNum,
      occupation: occupation.trim() || null,
      phone: phone.trim() || null,
      aadhaar_number: aadhaar.trim() || null,
      joined_date: joinedDate || null,
      left_date: leftDate || null,
      notes: notes.trim() || null,
    }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ ...input, id: member!.id })
        toast("success", "Family member updated.")
      } else {
        await createMutation.mutateAsync(input)
        toast("success", "Family member added.")
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit family member" : "Add family member"}
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="fm-name">Name *</Label>
          <Input
            id="fm-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="fm-rel">Relationship</Label>
          <Input
            id="fm-rel"
            className="mt-1"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Spouse, Son, Mother…"
          />
        </div>
        <div>
          <Label htmlFor="fm-dob">Date of birth</Label>
          <Input
            id="fm-dob"
            type="date"
            className="mt-1"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="fm-age">Age</Label>
          <Input
            id="fm-age"
            className="mt-1"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="numeric"
            placeholder="Auto from DOB if left blank — enter manually"
          />
        </div>
        <div>
          <Label htmlFor="fm-occupation">Occupation</Label>
          <Input
            id="fm-occupation"
            className="mt-1"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="fm-phone">Phone</Label>
          <Input
            id="fm-phone"
            className="mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="fm-aadhaar">Aadhaar number</Label>
          <Input
            id="fm-aadhaar"
            className="mt-1"
            value={aadhaar}
            onChange={(e) => setAadhaar(e.target.value)}
            inputMode="numeric"
            placeholder="12-digit number — stored securely, shown masked"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sensitive: only the last 4 digits are ever displayed.
          </p>
        </div>
        <div>
          <Label htmlFor="fm-joined">Joined date</Label>
          <Input
            id="fm-joined"
            type="date"
            className="mt-1"
            value={joinedDate}
            onChange={(e) => setJoinedDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="fm-left">Left date</Label>
          <Input
            id="fm-left"
            type="date"
            className="mt-1"
            value={leftDate}
            onChange={(e) => setLeftDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="fm-notes">Notes</Label>
          <Textarea
            id="fm-notes"
            className="mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add member"}
        </Button>
      </div>
    </Dialog>
  )
}
