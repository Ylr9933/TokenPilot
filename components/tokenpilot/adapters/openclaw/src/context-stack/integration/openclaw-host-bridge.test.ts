import test from "node:test";
import assert from "node:assert/strict";

import { createOpenClawHostBridge } from "./openclaw-host-bridge.js";

test("openclaw host bridge exposes request/response/stream host views", () => {
  const bridge = createOpenClawHostBridge({
    extractInputText: (input: any) => Array.isArray(input) ? input.map((item) => String(item?.content ?? "")).join("\n") : "",
    extractProviderResponseText: (raw: string) => raw.includes("hello") ? "hello" : "",
    contentToText: (value: unknown) => String(value ?? ""),
  });

  const request = bridge.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream: false,
    input: [{ role: "user", content: "hi" }],
  });
  const response = bridge.decodeResponse({
    id: "resp-1",
    output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }],
  }, {
    model: "tokenpilot/gpt-5.4-mini",
    stream: false,
    input: [{ role: "user", content: "hi" }],
  });
  const stream = bridge.snapshotStream("data: hello\n\n");

  assert.equal(request.model, "tokenpilot/gpt-5.4-mini");
  assert.equal(response.metadata?.responseId, "resp-1");
  assert.equal(stream.assistantText, "hello");
});
