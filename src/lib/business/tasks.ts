import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";
import { createActionPlanItem, type ActionPlanPhase } from "@/lib/actions/action-plan";

const FLAG = "business_plan_tasks_seeded";

/** Starter tasks for the salon and side-hustle pages. Runs once. */
export function seedBusinessPlanTasksOnce(): boolean {
  const flag = db.select({ key: schema.settings.key }).from(schema.settings).where(eq(schema.settings.key, FLAG)).get();
  if (flag) return false;

  const items: Array<{ title: string; description: string; phase: ActionPlanPhase; link: string; dueAt?: string; sortOrder: number }> = [
    {
      title: "Open a separate checking account for the salon",
      description: "Booth rent, GlossGenius payouts and supplies through one account turns Schedule C into a printout instead of a project.",
      phase: "this_month",
      link: "/plan/salon",
      sortOrder: 400,
    },
    {
      title: "Decide how April's self-employment tax gets paid",
      description: "Either a Q4 estimated payment (1040-ES, due 15 Jan) or extra withholding on AJ's W-4. It's a joint return, so his withholding counts against her tax. /tax models the W-4 side.",
      phase: "this_month",
      link: "/plan/salon",
      dueAt: "2027-01-15",
      sortOrder: 410,
    },
    {
      title: "Set the salon's 2027 price and weekly client goal",
      description: "The salon page shows how many clients a week it takes to reach the take-home the three futures assume.",
      phase: "this_month",
      link: "/plan/salon",
      sortOrder: 420,
    },
    {
      title: "Keep every salon receipt",
      description: "Booth rent, product, tools, classes, GlossGenius fees. All of it comes off her profit before self-employment tax.",
      phase: "ongoing",
      link: "/plan/salon",
      sortOrder: 430,
    },
    {
      title: "Pick the first app to ship: PackRat or Trust",
      description: "One app in the store earning something beats two that are nearly done.",
      phase: "this_month",
      link: "/plan/side-hustles",
      sortOrder: 500,
    },
    {
      title: "Enroll in the Apple Developer Program and the Small Business Program",
      description: "$99 a year. Under $1M in proceeds, the Small Business Program cuts Apple's commission from 30% to 15%, but only after you apply.",
      phase: "this_month",
      link: "/plan/side-hustles",
      sortOrder: 510,
    },
    {
      title: "Write a one-page consulting offer with a rate",
      description: "What you do, for whom, and the price. Enter the rate and hours on the side-hustles page to see what it closes.",
      phase: "this_month",
      link: "/plan/side-hustles",
      sortOrder: 520,
    },
    {
      title: "Track side income and costs apart from the household",
      description: "App proceeds, consulting invoices, API and hosting bills. It all lands on Schedule C, and so does self-employment tax.",
      phase: "ongoing",
      link: "/plan/side-hustles",
      sortOrder: 530,
    },
  ];

  db.transaction(() => {
    for (const item of items) createActionPlanItem(item);
    db.insert(schema.settings).values({ key: FLAG, value: now(), updatedAt: now() }).run();
  });
  return true;
}
