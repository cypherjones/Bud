import { getClient, MODEL } from "@/lib/ai/client";
import { buildSystemPrompt, buildFinancialContext } from "@/lib/ai/system-prompt";
import { budTools } from "@/lib/ai/tools";
import { handleToolCall } from "@/lib/ai/tool-handlers";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };

  if (!messages || messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const client = getClient();

  // Build dynamic system prompt with current financial context
  const context = await buildFinancialContext();
  const systemPrompt = buildSystemPrompt(context);

  // Convert to Anthropic message format
  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Persist user message
  const userMessage = messages[messages.length - 1];
  if (userMessage.role === "user") {
    db.insert(schema.chatMessages)
      .values({
        id: newId(),
        role: "user",
        content: userMessage.content,
        createdAt: now(),
      })
      .run();
  }

  try {
    // Agentic loop: handle tool calls iteratively
    let currentMessages = anthropicMessages;
    let finalText = "";
    let toolCallsLog: unknown[] = [];

    for (let iteration = 0; iteration < 10; iteration++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: budTools,
        messages: currentMessages,
      });

      // Collect text blocks
      const textBlocks = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text);

      // Collect tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
      );

      // If there are tool calls, execute them and continue the loop
      if (toolUseBlocks.length > 0) {
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const result = await handleToolCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
          toolCallsLog.push({
            tool: toolUse.name,
            input: toolUse.input,
            result: JSON.parse(result),
          });
        }

        // Add assistant response and tool results to conversation
        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: toolResults },
        ];

        // If there's also text, accumulate it
        if (textBlocks.length > 0) {
          finalText += textBlocks.join("\n");
        }

        // Continue the loop — Claude may want to call more tools or produce final text
        if (response.stop_reason === "tool_use") {
          continue;
        }
      }

      // No more tool calls — collect final text
      if (textBlocks.length > 0) {
        finalText += (finalText ? "\n" : "") + textBlocks.join("\n");
      }

      break; // Done
    }

    // Persist assistant message
    db.insert(schema.chatMessages)
      .values({
        id: newId(),
        role: "assistant",
        content: finalText,
        toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : null,
        createdAt: now(),
      })
      .run();

    return Response.json({
      role: "assistant",
      content: finalText,
      tool_calls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET: Load chat history
export async function GET() {
  const messages = db
    .select()
    .from(schema.chatMessages)
    .orderBy(schema.chatMessages.createdAt)
    .limit(100)
    .all();

  return Response.json({ messages });
}
