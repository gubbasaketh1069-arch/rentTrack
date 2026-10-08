import { useState } from "react"
import { MessageCircle, Send } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth"
import {
  isWhatsAppConfigured,
  normalizePhone,
  sendWhatsAppMessage,
} from "@/lib/whatsapp"
import { inr } from "@/lib/format"

/**
 * Owner settings: WhatsApp channel status and account info.
 * WhatsApp credentials come from environment variables
 * (VITE_WHATSAPP_API_TOKEN, VITE_WHATSAPP_PHONE_NUMBER_ID) — see .env.example.
 * Nothing is faked: when unconfigured the UI says so plainly.
 */
export default function SettingsPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [testPhone, setTestPhone] = useState("")
  const [sending, setSending] = useState(false)
  const configured = isWhatsAppConfigured()

  async function handleTestSend() {
    if (!testPhone.trim()) {
      toast("error", "Enter a phone number to send the test to.")
      return
    }
    setSending(true)
    const result = await sendWhatsAppMessage(
      normalizePhone(testPhone),
      "RentTrack test message\n\nIf you received this, WhatsApp notifications are working. " +
        `Test amount: ${inr(9750)}.`
    )
    setSending(false)
    if (result.ok) {
      toast("success", "Test message sent. Check WhatsApp on the recipient phone.")
    } else {
      toast("error", result.error ?? "Failed to send test message.")
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account, property, and notification preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp notifications
          </CardTitle>
          <CardDescription>
            Rent reminders and payment confirmations can be delivered over
            WhatsApp via the WhatsApp Business Cloud API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={configured ? "paid" : "neutral"}>
              {configured ? "Configured" : "Not configured"}
            </Badge>
          </div>
          {!configured ? (
            <p className="text-sm text-muted-foreground">
              To enable, add <code className="rounded bg-muted px-1">VITE_WHATSAPP_API_TOKEN</code>{" "}
              and <code className="rounded bg-muted px-1">VITE_WHATSAPP_PHONE_NUMBER_ID</code> to
              your environment (Vercel dashboard or <code className="rounded bg-muted px-1">.env</code>),
              then redeploy. Until then, WhatsApp notification rows are recorded
              as pending but nothing is sent.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Send a test message to verify the connection. Use the full
                number with country code (e.g. 919876543210).
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="wa-test-phone" className="sr-only">
                    Test phone number
                  </Label>
                  <Input
                    id="wa-test-phone"
                    placeholder="919876543210"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    inputMode="tel"
                  />
                </div>
                <Button onClick={() => void handleTestSend()} disabled={sending}>
                  <Send className="mr-1 h-4 w-4" />
                  {sending ? "Sending…" : "Send test"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed-in profile details.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{profile.full_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{profile.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Role</dt>
                <dd>
                  <Badge variant="neutral">{profile.role}</Badge>
                </dd>
              </div>
            </dl>
          ) : (
            <Skeleton className="h-20" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
