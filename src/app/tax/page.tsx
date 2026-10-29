import Link from "next/link";
import { PlanPage } from "@/components/plan/plan-ui";
import { AddTaxObligationDialog } from "@/components/debts/add-tax-obligation-dialog";
import { IrsInstallment } from "@/components/taxes/irs-installment";
import { TaxWorkspace } from "@/components/taxes/tax-planner";
import { getTaxPicture } from "@/lib/actions/taxes";
import { getHouseholdConfig } from "@/lib/household/config";

export const dynamic = "force-dynamic";

export default function TaxPage() {
  const household = getHouseholdConfig();
  const picture = getTaxPicture(household.tax.irsBalanceFallback);

  return (
    <PlanPage
      title="Tax"
      sub={
        <>
          His IRS installment as the bank shows it, what has a date on it before the 2026 return, and the return itself. The inputs are
          shared with the <Link href="/plan" className="underline decoration-dotted underline-offset-2">household plan</Link>.
        </>
      }
      actions={<AddTaxObligationDialog />}
    >
      <TaxWorkspace
        initialTax={household.tax}
        bonusGross={household.bonus.gross}
        picture={picture}
        irsSection={<IrsInstallment irs={picture.irs} obligations={picture.obligations} />}
      />
    </PlanPage>
  );
}
