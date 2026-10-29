import { Aside } from "@/components/plan/plan-ui";
import { formatCurrencyCompact } from "@/lib/utils/format";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

/**
 * What the three columns mean now that Meridian is closed. `net` is
 * budgetTotals(lines, income).net — the real month — and `cols` is futures().
 */
export function FuturesNotes({
  net,
  cols,
  draw,
  aprilTakeHome,
}: {
  net: number;
  cols: Array<{ moneyIn: number; out: number; left: number }>;
  draw: number;
  aprilTakeHome: number;
}) {
  const same = Math.round(cols[1].left) === Math.round(cols[2].left);
  return (
    <div className="space-y-4">
      <Aside title="The real month is the budget's, not column 3">
        <p>
          Today the household runs <b className="text-foreground tabular-nums">{usd(net)}</b> a month
          {net < 0 ? " short" : " ahead"}: AJ&apos;s pay and Simon and Frank against every line in the budget, including the
          tithe and savings. That is the number to plan around until April&apos;s income is steady.
        </p>
        <p>
          Columns 2 and 3 test April bringing home {usd(aprilTakeHome)} a month. Even then the month comes out at{" "}
          <span className="tabular-nums">{usd(cols[1].left)}</span>.
        </p>
      </Aside>
      <Aside title="Why columns 2 and 3 match">
        {draw === 0 ? (
          <p>
            Column 3 was built to show the month after the Meridian draw stopped. Meridian paid its final draw on 27 October
            and the draw in the income is now $0, so {same ? "the two columns are the same" : "the only difference left is the draw"}.
          </p>
        ) : (
          <p>
            Meridian paid its final draw on 27 October, but the income still carries a {usd(draw)} draw. Set it to $0 on the
            budget page so column 1 shows the real month.
          </p>
        )}
      </Aside>
    </div>
  );
}
