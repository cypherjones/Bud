import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildFinancialContext } from "../../lib/ai/system-prompt.js";
import { budTools } from "../../lib/ai/tools.js";
import { handleToolCall } from "../../lib/ai/tool-handlers.js";
import { header, purple, dim, bold } from "../helpers.js";
import * as readline from "readline";

const MODEL = "claude-sonnet-4-20250514";

async function askBud(message: string, history: Anthropic.Messages.MessageParam[]): Promise<string> {
  const client = new Anthropic();
  const context = await buildFinancialContext();
  const systemPrompt = buildSystemPrompt(context);

  const messages: Anthropic.Messages.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  let currentMessages = messages;
  let finalText = "";

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: budTools,
      messages: currentMessages,
    });

    const textBlocks = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text);

    const toolBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    if (toolBlocks.length > 0) {
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tool of toolBlocks) {
        process.stdout.write(dim(`  [${tool.name}] `));
        const result = await handleToolCall(tool.name, tool.input as Record<string, unknown>);
        process.stdout.write(dim("done\n"));
        results.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }

      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: results },
      ];

      if (textBlocks.length > 0) finalText += textBlocks.join("\n");
      if (response.stop_reason === "tool_use") continue;
    }

    if (textBlocks.length > 0) {
      finalText += (finalText ? "\n" : "") + textBlocks.join("\n");
    }
    break;
  }

  return finalText;
}

export async function chatCommand(message?: string) {
  if (message) {
    // One-shot mode
    header("Bud", "one-shot query");
    try {
      const response = await askBud(message, []);
      console.log(response);
      console.log();
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
      console.error("Make sure ANTHROPIC_API_KEY is set (via Doppler or env).");
    }
    return;
  }

  // Interactive mode
  header("Bud", "interactive chat — type 'exit' to quit");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: Anthropic.Messages.MessageParam[] = [];

  const prompt = () => {
    rl.question(purple("you> "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "exit" || trimmed === "quit") {
        console.log(dim("\nGoodbye."));
        rl.close();
        return;
      }

      try {
        const response = await askBud(trimmed, history);
        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: response });
        console.log();
        console.log(bold("bud>"), response);
        console.log();
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
      }

      prompt();
    });
  };

  prompt();
}
