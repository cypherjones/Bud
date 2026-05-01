#!/usr/bin/env node

import { Command } from "commander";
import { statusCommand } from "./commands/status.js";
import { chatCommand } from "./commands/chat.js";
import { debtsCommand } from "./commands/debts.js";
import { moveCommand } from "./commands/move.js";
import { creditCommand } from "./commands/credit.js";
import { syncCommand } from "./commands/sync.js";
import { transactionsCommand } from "./commands/transactions.js";

const program = new Command();

program
  .name("bud")
  .description("Bud — AI-first personal financial command center")
  .version("0.1.0");

program
  .command("status")
  .description("Quick financial snapshot")
  .action(statusCommand);

program
  .command("chat [message]")
  .description("Chat with Bud (one-shot or interactive)")
  .action(chatCommand);

program
  .command("debts")
  .description("Debt overview with smart allocation")
  .action(debtsCommand);

program
  .command("move")
  .description("Houston move plan status")
  .action(moveCommand);

program
  .command("credit")
  .description("Credit score trend")
  .action(creditCommand);

program
  .command("sync")
  .description("Sync bank transactions via Teller")
  .action(syncCommand);

program
  .command("transactions")
  .alias("tx")
  .description("Recent transactions")
  .option("-n, --limit <number>", "Number of transactions", "15")
  .action(transactionsCommand);

// Default: show status if no command given
if (process.argv.length <= 2) {
  statusCommand();
} else {
  program.parse();
}
