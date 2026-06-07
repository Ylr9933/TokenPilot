import test from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("./index.js");
const hooks = plugin.__testHooks as {
  rewritePayloadForStablePrefix: (
    payload: any,
    model: string,
    options?: {
      dynamicContextTarget?: "developer" | "user";
      developerTextForKeyOverride?: string;
    },
  ) => {
    promptCacheKey: string;
    userContentRewrites: number;
    senderMetadataBlocksBefore: number;
    senderMetadataBlocksAfter: number;
    developerTextForKey: string;
  };
  applyProxyReductionToInput: (
    payload: any,
    options?: Record<string, unknown>,
  ) => Promise<{
    changedItems: number;
    changedBlocks: number;
    savedChars: number;
    diagnostics?: {
      skippedReason?: string;
    };
  }> | {
    changedItems: number;
    changedBlocks: number;
    savedChars: number;
    diagnostics?: {
      skippedReason?: string;
    };
  };
  stripInternalPayloadMarkers: (payload: any) => void;
  normalizeConfig: (raw: unknown) => any;
  responsesPayloadToChatCompletions: (payload: any) => any;
  chatCompletionsToResponsesText: (raw: string) => string;
};

test("applyProxyReductionToInput reduces large tool payload and preserves non-tool entries", async () => {
  const largeJson = JSON.stringify({
    rows: Array.from({ length: 800 }, (_, i) => ({ id: i, value: `payload-${i}` })),
  });
  const payload: any = {
    input: [
      { role: "tool", content: largeJson },
      { role: "user", content: "keep me unchanged" },
    ],
  };

  const out = await hooks.applyProxyReductionToInput(payload);

  assert.equal(out.changedItems, 1);
  assert.equal(out.changedBlocks, 1);
  assert.ok(out.savedChars > 0);
  assert.match(String(payload.input[0].content), /\[Tool payload trimmed\]/);
  assert.match(String(payload.input[0].content), /memory_fault_recover/);
  assert.match(String(payload.input[0].content), /"dataKey":/);
  assert.equal(payload.input[1].content, "keep me unchanged");
});

test("applyProxyReductionToInput reduces responses-style function call fields", async () => {
  const largeOutput = JSON.stringify({
    rows: Array.from({ length: 1200 }, (_, i) => ({ id: i, value: `tool-output-${i}` })),
  });
  const largeArguments = JSON.stringify({
    query: "x".repeat(3200),
  });
  const payload: any = {
    input: [
      { type: "function_call", name: "search", arguments: largeArguments },
      { type: "function_call_output", call_id: "call_123", output: largeOutput },
    ],
  };

  const out = await hooks.applyProxyReductionToInput(payload);

  assert.equal(out.changedItems, 1);
  assert.equal(out.changedBlocks, 1);
  assert.ok(out.savedChars > 0);
  assert.equal(payload.input[0].arguments, largeArguments);
  assert.match(String(payload.input[1].output), /\[Tool payload trimmed\]/);
});

test("stripInternalPayloadMarkers removes internal flags before forwarding upstream", () => {
  const payload: any = {
    __ecoclaw_reduction_applied: true,
    input: [
      { role: "user", __ecoclaw_replay_raw: true, content: "hello" },
      { role: "assistant", content: "world" },
    ],
  };

  hooks.stripInternalPayloadMarkers(payload);

  assert.equal("__ecoclaw_reduction_applied" in payload, false);
  assert.equal("__ecoclaw_replay_raw" in payload.input[0], false);
  assert.equal(payload.input[0].content, "hello");
  assert.equal(payload.input[1].content, "world");
});

test("rewritePayloadForStablePrefix preserves content shape and injects dynamic context to first user", () => {
  const payload: any = {
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "Runtime: agent=bench-tokenpilot-gpt-5-4-mini-0213-j0013 | host=mistral\nYour working directory is: /tmp/pinchbench/0213/agent_workspace_j0013",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: "Please continue." }],
      },
    ],
  };

  const out = hooks.rewritePayloadForStablePrefix(payload, "tokenpilot/gpt-5.4-mini", {
    dynamicContextTarget: "user",
  });

  assert.match(String(payload.input[0].content[0].text), /Your working directory is: <WORKDIR>/);
  assert.equal(Array.isArray(payload.input[0].content), true);
  assert.match(String(payload.input[1].content[0].text), /- WORKDIR: \/tmp\/pinchbench\/0213\/agent_workspace_j0013/);
  assert.match(String(payload.input[1].content[0].text), /- AGENT_ID: bench-tokenpilot-gpt-5-4-mini-0213-j0013/);
  assert.match(String(payload.input[1].content[0].text), /Please continue\./);
  assert.match(out.promptCacheKey, /^runtime-pfx-/);
});

test("applyProxyReductionToInput still runs with policy-only before-call modules", async () => {
  const cfg = hooks.normalizeConfig({
    modules: {
      policy: true,
      reduction: false,
    },
  });

  const { createPolicyModule } = await import("@tokenpilot/decision");

  const payload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      {
        role: "tool",
        toolName: "read",
        path: "/workspace/spec.md",
        content: "A".repeat(600),
      },
      {
        role: "tool",
        toolName: "write",
        path: "/workspace/output.md",
        content: "Successfully wrote 120 bytes to /workspace/output.md",
      },
    ],
  };

  const out = await hooks.applyProxyReductionToInput(payload, {
    triggerMinChars: 2200,
    maxToolChars: 1200,
    passToggles: {
      repeatedReadDedup: false,
      toolPayloadTrim: false,
      htmlSlimming: false,
      execOutputTruncation: false,
      agentsStartupOptimization: false,
      memoryFaultRecovery: false,
    },
    beforeCallModules: {
      policy: createPolicyModule({
        localityEnabled: true,
        reductionEnabled: false,
        reductionFormatSlimmingEnabled: false,
        reductionSemanticEnabled: false,
        handoffEnabled: false,
        evictionEnabled: false,
        cacheHealthEnabled: false,
      }),
    },
    cfg,
  });

  assert.equal(out.changedItems, 0);
  assert.equal(out.changedBlocks, 0);
  assert.equal(out.savedChars, 0);
  assert.equal(String(out.diagnostics?.skippedReason), "pipeline_no_effect");
  assert.equal(
    payload.input[1].content,
    "Successfully wrote 120 bytes to /workspace/output.md",
  );
});

test("responsesPayloadToChatCompletions preserves tools and function call history", () => {
  const payload = {
    model: "gpt-5.4-mini",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "先读一下 docs 目录" }],
      },
      {
        type: "function_call",
        call_id: "call_read_1",
        name: "read",
        arguments: "{\"path\":\"/tmp/docs/README.md\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "{\"content\":\"hello\"}",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "read",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_output_tokens: 128,
  };

  const out = hooks.responsesPayloadToChatCompletions(payload);

  assert.equal(out.model, "gpt-5.4-mini");
  assert.equal(out.tool_choice, "auto");
  assert.equal(Array.isArray(out.tools), true);
  assert.equal(out.tools[0].function.name, "read");
  assert.equal(Array.isArray(out.messages), true);
  assert.equal(out.messages[0].role, "user");
  assert.equal(out.messages[0].content, "先读一下 docs 目录");
  assert.equal(out.messages[1].role, "assistant");
  assert.equal(Array.isArray(out.messages[1].tool_calls), true);
  assert.equal(out.messages[1].tool_calls[0].id, "call_read_1");
  assert.equal(out.messages[1].tool_calls[0].function.name, "read");
  assert.equal(out.messages[2].role, "tool");
  assert.equal(out.messages[2].tool_call_id, "call_read_1");
  assert.equal(out.messages[2].content, "{\"content\":\"hello\"}");
});

test("chatCompletionsToResponsesText converts tool calls back into responses output", () => {
  const raw = JSON.stringify({
    id: "chatcmpl_123",
    object: "chat.completion",
    created: 1780766344,
    model: "gpt-5.4-mini",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_read_2",
              type: "function",
              function: {
                name: "read",
                arguments: "{\"path\":\"/tmp/docs/README.md\"}",
              },
            },
          ],
        },
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 12,
      total_tokens: 112,
    },
  });

  const out = JSON.parse(hooks.chatCompletionsToResponsesText(raw));

  assert.equal(out.status, "incomplete");
  assert.equal(out.model, "gpt-5.4-mini");
  assert.equal(out.output_text, "");
  assert.equal(Array.isArray(out.output), true);
  assert.equal(out.output[0].type, "function_call");
  assert.equal(out.output[0].call_id, "call_read_2");
  assert.equal(out.output[0].name, "read");
  assert.equal(out.output[0].arguments, "{\"path\":\"/tmp/docs/README.md\"}");
  assert.deepEqual(out.usage, {
    input_tokens: 100,
    output_tokens: 12,
    total_tokens: 112,
  });
});
