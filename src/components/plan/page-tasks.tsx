import { getActionPlanItems } from "@/lib/actions/action-plan";
import { PlanChecklist } from "@/components/budget/plan-checklist";
import { SectionHead } from "./plan-ui";

/** The action-plan items that belong to one page (matched on their link). */
export function PageTasks({ link, title = "To do", sub }: { link: string; title?: string; sub?: string }) {
  const items = getActionPlanItems().filter((i) => i.link === link);
  return (
    <section className="space-y-3">
      <SectionHead id="tasks" title={title} sub={sub ?? "Tasks from this page. They're also on Still open, with everything else."} />
      <PlanChecklist items={items} title="Tasks" newItemLink={link} />
    </section>
  );
}
