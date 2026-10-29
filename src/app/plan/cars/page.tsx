import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadPlan } from "@/lib/household/load";
import { CarsSection, type CarLoan } from "@/components/plan/reference/cars";
import { PlanPage } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";
import type { HouseholdLine } from "@/lib/household/calc";

export const dynamic = "force-dynamic";

type Debt = typeof schema.debts.$inferSelect;

const dollars = (lines: HouseholdLine[], match: RegExp) =>
  lines.filter((l) => match.test(l.label)).reduce((s, l) => s + l.amount / 100, 0);

function loan(lines: HouseholdLine[], debts: Debt[], line: RegExp, debt: RegExp): CarLoan {
  const d = debts.find((x) => x.type === "auto_loan" && debt.test(x.creditorName));
  return {
    payment: dollars(lines, line),
    balance: d ? d.currentBalance / 100 : null,
    apr: d ? d.interestRate * 100 : null,
  };
}

export default function CarsPage() {
  const { lines } = loadPlan();
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  const transportLines = lines.filter((l) => /transport/i.test(l.groupName));

  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="The cars"
      sub="Three vehicles, two notes, seven people. What's known, what isn't, and the options."
    >
      <CarsSection
        data={{
          maverick: loan(lines, debts, /maverick/i, /primary car|maverick/i),
          tiguan: loan(lines, debts, /tiguan/i, /\bvw\b|tiguan/i),
          insurance: dollars(transportLines, /insurance/i),
          fuel: dollars(transportLines, /fuel/i),
          transport: transportLines.reduce((s, l) => s + l.amount / 100, 0),
        }}
      />
      <PageTasks link="/plan/cars" />
    </PlanPage>
  );
}
