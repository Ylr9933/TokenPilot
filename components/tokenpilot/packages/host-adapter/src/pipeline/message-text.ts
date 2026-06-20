/* eslint-disable @typescript-eslint/no-explicit-any */

const SENDER_METADATA_BLOCK_RE =
  /(?:^|\n{1,2})Sender\s+\(untrusted metadata\):\s*```json\s*[\s\S]*?```(?:\n{1,2}|$)/gi;

export function extractContentText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        if (typeof entry.text === "string") return entry.text;
        if (typeof entry.content === "string") return entry.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (!content || typeof content !== "object") return "";
  if (typeof content.text === "string") return content.text;
  if (typeof content.content === "string") return content.content;
  return "";
}

export function replaceContentText(content: any, nextText: string): any {
  if (typeof content === "string") return nextText;
  if (Array.isArray(content)) {
    const next = content.map((entry) => (entry && typeof entry === "object" ? { ...entry } : entry));
    for (let i = 0; i < next.length; i += 1) {
      const entry = next[i];
      if (!entry || typeof entry !== "object") continue;
      if (typeof (entry as any).text === "string") {
        (entry as any).text = nextText;
        return next;
      }
      if (typeof (entry as any).content === "string") {
        (entry as any).content = nextText;
        return next;
      }
    }
    next.unshift({ type: "input_text", text: nextText });
    return next;
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return { ...content, text: nextText };
    if (typeof content.content === "string") return { ...content, content: nextText };
  }
  return nextText;
}

export function prependTextToContent(content: any, extraText: string): any {
  const extra = String(extraText ?? "").trim();
  if (!extra) return content;
  if (typeof content === "string") {
    return content.trim().length > 0 ? `${extra}\n\n${content}` : extra;
  }
  if (Array.isArray(content)) {
    const next = content.map((item) => (item && typeof item === "object" ? { ...item } : item));
    for (let i = 0; i < next.length; i += 1) {
      const item = next[i];
      if (!item || typeof item !== "object") continue;
      if (typeof (item as any).text === "string") {
        (item as any).text = (item as any).text.trim().length > 0
          ? `${extra}\n\n${String((item as any).text)}`
          : extra;
        return next;
      }
      if (typeof (item as any).content === "string") {
        (item as any).content = (item as any).content.trim().length > 0
          ? `${extra}\n\n${String((item as any).content)}`
          : extra;
        return next;
      }
    }
    next.unshift({ type: "input_text", text: extra });
    return next;
  }
  return extra;
}

export function normalizeText(input: string): string {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function stripUntrustedSenderMetadata(text: string): string {
  const raw = String(text ?? "");
  const withoutMetadata = raw.replace(SENDER_METADATA_BLOCK_RE, "\n\n");
  return withoutMetadata.replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeUserMessageText(text: string): string {
  return stripUntrustedSenderMetadata(String(text ?? ""))
    .replace(/^\[[^\]\n]{6,}\]\s*/u, "")
    .replace(/^(?:-\s*[A-Z][A-Z0-9_]*\s*:\s*[^\n]*\n)+/u, "")
    .trim();
}

function relocateToolingSectionToEnd(text: string): string {
  const markerA = "## Tooling";
  const markerB = "\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.";
  const start = text.indexOf(markerA);
  if (start < 0) return text;
  const end = text.indexOf(markerB, start);
  if (end < 0) return text;
  const toolingEnd = end + markerB.length;
  const tooling = text.slice(start, toolingEnd).trim();
  const before = text.slice(0, start).trimEnd();
  const after = text.slice(toolingEnd).trimStart();
  const body = [before, after].filter(Boolean).join("\n\n").trim();
  if (!body) return tooling;
  return `${body}\n\n${tooling}`;
}

export type StablePrefixTextRewrite = {
  canonicalText: string;
  forwardedText: string;
  dynamicContextText: string;
  changed: boolean;
  workdir?: string;
  agentId?: string;
};

export function rewriteTextForStablePrefix(promptText: string): StablePrefixTextRewrite {
  const raw = String(promptText ?? "");
  if (!raw.trim()) {
    return {
      canonicalText: raw,
      forwardedText: raw,
      dynamicContextText: "",
      changed: false,
    };
  }

  const workdirMatch = raw.match(/Your working directory is:\s*([^\n\r]+)/i);
  const runtimeAgentMatch = raw.match(/Runtime:\s*agent=([^|\n\r]+)/i);
  const workdir = workdirMatch?.[1]?.trim();
  const agentId = runtimeAgentMatch?.[1]?.trim();

  let canonical = raw;
  canonical = relocateToolingSectionToEnd(canonical);
  if (workdir) {
    canonical = canonical.split(workdir).join("<WORKDIR>");
  }
  canonical = canonical.replace(/(Runtime:\s*agent=)[^|\n\r]+(\s*\|?)/gi, (_match, prefix: string, suffix: string) => {
    const normalizedSuffix = suffix.includes("|") ? " |" : "";
    return `${prefix}<AGENT_ID>${normalizedSuffix}`;
  });
  canonical = canonical.replace(
    /^##\s+<WORKDIR>[\\/]+([^\\/\n\r]+)$/gm,
    "## $1",
  );
  canonical = canonical.replace(
    /^##\s+(?:[A-Za-z]:[\\/]|\/)[^\n\r]*[\\/]+([^\\/\n\r]+)$/gm,
    "## $1",
  );
  canonical = canonical.replace(
    /(\[MISSING\]\s+Expected at:\s*)<WORKDIR>[\\/]+([^\\/\n\r]+)/g,
    "$1$2",
  );
  canonical = canonical.replace(
    /(\[MISSING\]\s+Expected at:\s*)(?:[A-Za-z]:[\\/]|\/)[^\n\r]*[\\/]+([^\\/\n\r]+)/g,
    "$1$2",
  );

  const dynamicLines: string[] = [];
  if (workdir) dynamicLines.push(`- WORKDIR: ${workdir}`);
  if (agentId) dynamicLines.push(`- AGENT_ID: ${agentId}`);
  const dynamicContextText = dynamicLines.join("\n");

  return {
    canonicalText: canonical,
    forwardedText: canonical,
    dynamicContextText,
    changed: canonical !== raw || dynamicContextText.length > 0,
    workdir,
    agentId,
  };
}
