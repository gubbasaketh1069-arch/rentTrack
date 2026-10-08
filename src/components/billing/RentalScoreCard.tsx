import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useRentalScore } from "@/hooks/useRentalScore"
import { SCORE_METHODOLOGY } from "@/lib/rentalScore"

const GRADE_STYLES: Record<string, string> = {
  A: "bg-green-600 text-white",
  B: "bg-emerald-500 text-white",
  C: "bg-amber-500 text-white",
  D: "bg-red-500 text-white",
}

/**
 * Tenant rental score (added feature B) — a portable payment-behavior
 * summary computed from real recorded payments. The card always shows the
 * inputs behind the score; the methodology note keeps it honest.
 */
export default function RentalScoreCard({
  tenantId,
  tenancyId,
}: {
  tenantId: string
  tenancyId: string | undefined
}) {
  const { data: score, isLoading } = useRentalScore(tenantId, tenancyId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rental score</CardTitle>
        <CardDescription>
          Payment behavior across recorded billing months — portable and
          explainable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !score || score.scoredMonths === 0 ? (
          <p className="text-sm text-muted-foreground">
            No billing history yet — the score appears after the first monthly
            bill and payment are recorded.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ${GRADE_STYLES[score.grade]}`}
                aria-label={`Rental score ${score.score}, grade ${score.grade}`}
              >
                {score.grade}
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{score.score}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  based on {score.scoredMonths} billing month{score.scoredMonths === 1 ? "" : "s"} ·{" "}
                  {score.paymentsCount} payment{score.paymentsCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">On-time</dt>
                <dd className="font-semibold">{score.onTimePct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Months fully paid</dt>
                <dd className="font-semibold">{score.fullPaidPct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Overdue now</dt>
                <dd className="font-semibold">{score.overdueMonths} month{score.overdueMonths === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tenancy length</dt>
                <dd className="font-semibold">{score.tenancyMonths} month{score.tenancyMonths === 1 ? "" : "s"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{SCORE_METHODOLOGY}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
