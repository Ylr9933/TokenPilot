import type { HostRequestEnvelope } from "../model/host-request.js";
import {
  extractContentText,
  normalizeUserMessageText,
  prependTextToContent,
  replaceContentText,
  rewriteTextForStablePrefix,
} from "./message-text.js";

function rewriteInstructions(
  envelope: HostRequestEnvelope,
): {
  changed: boolean;
  instructions: string | undefined;
  dynamicContextText: string;
} {
  const instructions = typeof envelope.instructions === "string" ? envelope.instructions : "";
  if (!instructions.trim()) {
    return {
      changed: false,
      instructions: envelope.instructions,
      dynamicContextText: "",
    };
  }
  const rewrite = rewriteTextForStablePrefix(instructions);
  if (!rewrite.changed) {
    return {
      changed: false,
      instructions: envelope.instructions,
      dynamicContextText: "",
    };
  }
  return {
    changed: true,
    instructions: rewrite.forwardedText,
    dynamicContextText: rewrite.dynamicContextText,
  };
}

function rewriteSystemMessage(messages: HostRequestEnvelope["messages"]): {
  changed: boolean;
  messages: HostRequestEnvelope["messages"];
  dynamicContextText: string;
} {
  const systemIndex = messages.findIndex((message) => message?.role === "system");
  if (systemIndex < 0) {
    return { changed: false, messages, dynamicContextText: "" };
  }
  const systemMessage = messages[systemIndex];
  const sourceText = extractContentText(systemMessage.content);
  if (!sourceText.trim()) {
    return { changed: false, messages, dynamicContextText: "" };
  }
  const rewrite = rewriteTextForStablePrefix(sourceText);
  if (!rewrite.changed) {
    return { changed: false, messages, dynamicContextText: "" };
  }
  const nextMessages = messages.slice();
  nextMessages[systemIndex] = {
    ...systemMessage,
    content: replaceContentText(systemMessage.content, rewrite.forwardedText),
  };
  return {
    changed: true,
    messages: nextMessages,
    dynamicContextText: rewrite.dynamicContextText,
  };
}

function normalizeUserMessages(messages: HostRequestEnvelope["messages"]): {
  changed: boolean;
  messages: HostRequestEnvelope["messages"];
} {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message?.role !== "user") return message;
    const sourceText = extractContentText(message.content);
    if (!sourceText.trim()) return message;
    const normalizedText = normalizeUserMessageText(sourceText);
    if (normalizedText === sourceText) return message;
    changed = true;
    return {
      ...message,
      content: replaceContentText(message.content, normalizedText),
    };
  });
  return { changed, messages: changed ? nextMessages : messages };
}

function injectDynamicContext(
  messages: HostRequestEnvelope["messages"],
  dynamicContextText: string,
): {
  changed: boolean;
  messages: HostRequestEnvelope["messages"];
} {
  if (!dynamicContextText.trim()) return { changed: false, messages };
  const userIndex = messages.findIndex((message) => message?.role === "user");
  if (userIndex < 0) return { changed: false, messages };
  const userMessage = messages[userIndex];
  const sourceText = extractContentText(userMessage.content);
  if (sourceText.includes(dynamicContextText)) {
    return { changed: false, messages };
  }
  const nextMessages = messages.slice();
  nextMessages[userIndex] = {
    ...userMessage,
    content: prependTextToContent(userMessage.content, dynamicContextText),
  };
  return { changed: true, messages: nextMessages };
}

export function defaultPrepareStablePrefix(
  envelope: HostRequestEnvelope,
): HostRequestEnvelope {
  const instructionRewrite = rewriteInstructions(envelope);
  const sourceMessages = instructionRewrite.changed ? envelope.messages : envelope.messages;
  const systemRewrite = instructionRewrite.changed
    ? { changed: false, messages: sourceMessages, dynamicContextText: instructionRewrite.dynamicContextText }
    : rewriteSystemMessage(sourceMessages);
  const normalizedUsers = normalizeUserMessages(systemRewrite.messages);
  const dynamicContextText = instructionRewrite.dynamicContextText || systemRewrite.dynamicContextText;
  const dynamicInjection = injectDynamicContext(normalizedUsers.messages, dynamicContextText);

  const anyChanged =
    instructionRewrite.changed ||
    systemRewrite.changed ||
    normalizedUsers.changed ||
    dynamicInjection.changed;

  if (!anyChanged) return envelope;

  const nextInstructions = instructionRewrite.changed
    ? instructionRewrite.instructions
    : dynamicContextText && !dynamicInjection.changed && typeof envelope.instructions === "string"
      ? `${envelope.instructions}\n\n${dynamicContextText}`
      : envelope.instructions;

  return {
    ...envelope,
    instructions: nextInstructions,
    messages: dynamicInjection.messages,
  };
}

export function prepareStablePrefixEnvelope(
  envelope: HostRequestEnvelope,
  transform?: (envelope: HostRequestEnvelope) => HostRequestEnvelope,
): { envelope: HostRequestEnvelope; applied: boolean } {
  const next = (transform ?? defaultPrepareStablePrefix)(envelope);
  return { envelope: next, applied: next !== envelope };
}
