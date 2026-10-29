import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { now } from "@/lib/utils/format";

// ============================================================
// LINK / UNLINK A TRANSACTION TO A SAVINGS GOAL
// ============================================================

export type LinkResult =
  | { success: true; goalId: string; transactionId: string; newCurrent: number }
  | { success: false; error: string };

/**
 * Mark a transaction as a contribution toward a savings goal. Adds the
 * transaction's amount to goal.currentAmount and stamps transactions.linked_goal_id.
 *
 * The transaction must be type=income (or a Transfers/Internal-categorized
 * positive flow) — the caller passes whatever the user picks. We don't second-
 * guess the category; the user's intent is authoritative.
 */
export function linkTransactionToGoal(transactionId: string, goalId: string): LinkResult {
  const tx = db.select().from(schema.transactions).where(eq(schema.transactions.id, transactionId)).get();
  if (!tx) return { success: false, error: `Transaction ${transactionId} not found` };

  const goal = db.select().from(schema.savingsGoals).where(eq(schema.savingsGoals.id, goalId)).get();
  if (!goal) return { success: false, error: `Goal ${goalId} not found` };

  if (tx.linkedGoalId === goalId) {
    return { success: true, goalId, transactionId, newCurrent: goal.currentAmount };
  }

  // If already linked to a different goal, unlink the prior one first.
  if (tx.linkedGoalId && tx.linkedGoalId !== goalId) {
    const oldGoal = db.select().from(schema.savingsGoals).where(eq(schema.savingsGoals.id, tx.linkedGoalId)).get();
    if (oldGoal) {
      db.update(schema.savingsGoals)
        .set({ currentAmount: Math.max(0, oldGoal.currentAmount - tx.amount), updatedAt: now() })
        .where(eq(schema.savingsGoals.id, oldGoal.id))
        .run();
    }
  }

  const newCurrent = goal.currentAmount + tx.amount;
  db.update(schema.savingsGoals)
    .set({ currentAmount: newCurrent, updatedAt: now() })
    .where(eq(schema.savingsGoals.id, goalId))
    .run();

  db.update(schema.transactions)
    .set({ linkedGoalId: goalId })
    .where(eq(schema.transactions.id, transactionId))
    .run();

  return { success: true, goalId, transactionId, newCurrent };
}

export function unlinkTransactionFromGoal(transactionId: string): LinkResult {
  const tx = db.select().from(schema.transactions).where(eq(schema.transactions.id, transactionId)).get();
  if (!tx) return { success: false, error: `Transaction ${transactionId} not found` };
  if (!tx.linkedGoalId) return { success: false, error: "Transaction is not linked to any goal" };

  const goalId = tx.linkedGoalId;
  const goal = db.select().from(schema.savingsGoals).where(eq(schema.savingsGoals.id, goalId)).get();
  if (!goal) {
    // Goal vanished — clear the link anyway.
    db.update(schema.transactions).set({ linkedGoalId: null }).where(eq(schema.transactions.id, transactionId)).run();
    return { success: false, error: "Linked goal no longer exists; cleared the link" };
  }

  const newCurrent = Math.max(0, goal.currentAmount - tx.amount);
  db.update(schema.savingsGoals)
    .set({ currentAmount: newCurrent, updatedAt: now() })
    .where(eq(schema.savingsGoals.id, goalId))
    .run();

  db.update(schema.transactions)
    .set({ linkedGoalId: null })
    .where(eq(schema.transactions.id, transactionId))
    .run();

  return { success: true, goalId, transactionId, newCurrent };
}

// ============================================================
// READ HELPERS
// ============================================================

export type GoalContribution = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  accountName: string | null;
};

export function getGoalContributions(goalId: string): GoalContribution[] {
  return db
    .select({
      id: schema.transactions.id,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      description: schema.transactions.description,
      merchant: schema.transactions.merchant,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(eq(schema.transactions.linkedGoalId, goalId))
    .orderBy(desc(schema.transactions.date))
    .all();
}

/** A deposit into savings that could be linked to a goal; the shape the link picker takes. */
export type LinkableTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  accountName: string | null;
  accountSubtype: string | null;
};

// ============================================================
// DELETE A GOAL
// ============================================================

/**
 * Remove a savings goal the user no longer wants. Linked transactions stay;
 * only their link is cleared. Called from the Savings page's "Old goals"
 * list when the user presses Delete, never automatically.
 */
export function deleteSavingsGoal(goalId: string): { success: true } | { success: false; error: string } {
  const goal = db
    .select({ id: schema.savingsGoals.id })
    .from(schema.savingsGoals)
    .where(eq(schema.savingsGoals.id, goalId))
    .get();
  if (!goal) return { success: false, error: "Goal not found" };
  db.update(schema.transactions).set({ linkedGoalId: null }).where(eq(schema.transactions.linkedGoalId, goalId)).run();
  db.delete(schema.savingsGoals).where(eq(schema.savingsGoals.id, goalId)).run();
  return { success: true };
}
