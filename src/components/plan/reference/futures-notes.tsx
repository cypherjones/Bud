import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { label: string; value: string; bold?: boolean; tone?: "neg" };

function MiniTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3">{r.bold ? <b>{r.label}</b> : r.label}</td>
              <td className={`py-1.5 tabular-nums text-right ${r.tone === "neg" ? "text-red-400" : ""}`}>
                {r.bold ? <b>{r.value}</b> : r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FuturesNotes() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">What the third column assumes, and when it happens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Only that the $3,750 draw stops and nothing replaces it.{" "}
            <b className="text-foreground">Meridian is not paying one person, it is paying three:</b> his $3,750 guaranteed payment,
            an equal guaranteed payment to the other partner, and an employee at the same amount on a W-2 with about
            $287 of employer payroll tax on top. That is <b className="text-foreground tabular-nums">$11,537</b> a month of people
            before a single tool is paid for.
          </p>
          <MiniTable
            rows={[
              { label: "Business account, 2 June", value: "58,804" },
              { label: "Business account, 2 September", value: "22,965" },
              { label: "Spent over those 92 days", value: "35,839" },
              { label: "Observed rate", value: "11,858 / month", bold: true },
              { label: "Balance on 16 September", value: "17,135" },
              { label: "Runs dry", value: "about 29 October", bold: true, tone: "neg" },
            ]}
          />
          <p>
            The observed rate and the three-person cost agree within a few hundred dollars, which is a good sign the
            picture is complete. <b className="text-foreground">This is about seven weeks away.</b> That is roughly 20 guaranteed
            payments for 2026, which is why the tax section starts at $37,500 rather than a full year’s $45,000.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Where the partnership loss comes from</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            It isn’t a write-down or an accounting adjustment. A business with no revenue that pays money out has a
            loss exactly equal to what it pays out.
          </p>
          <MiniTable
            rows={[
              { label: "Revenue, 2026", value: "0" },
              { label: "Guaranteed payment to him", value: "−37,500" },
              { label: "Guaranteed payment to the other partner", value: "−37,500" },
              { label: "Employee wages and employer payroll tax", value: "−40,371" },
              { label: "Tools and other operating cost", value: "−9,138" },
              { label: "Partnership loss for 2026, roughly", value: "−124,509", bold: true },
              { label: "His share at 35%", value: "−43,578" },
            ]}
          />
          <p>
            Guaranteed payments are deductible to the partnership even though they’re taxable to the partner — which
            is why his own $37,500 appears both as income to him and as part of the partnership’s loss. His share
            arrives on the K-1. Whether he can actually <i>use</i> it depends on his basis, and the agreements say his
            contribution was sweat equity — see below. If it is usable it is worth more than everything else on this
            page combined.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
