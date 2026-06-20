/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "node:stream";
import type { UpstreamConfig, UpstreamHttpResponse, UpstreamStreamResponse } from "./upstream-types.js";
import { chatCompletionsToResponsesText, isCompletionsApiFamily } from "./upstream-adapter.js";
import { convertChatCompletionsSseToResponsesText, createChatCompletionsToResponsesSseTransform, isSseContentType } from "./upstream-sse.js";
import { requestUpstreamWithCurl } from "./upstream-transport-curl.js";
import { hasExplicitUpstreamProxyEnv } from "./upstream-transport-proxy.js";
import { buildNonStreamingUpstreamRequestPayload, buildUpstreamRequestPayload, upstreamEndpoint } from "./upstream-transport-shared.js";
import { appendUpstreamTransportTrace } from "./upstream-transport-trace.js";

type TransportLogger = {
  warn: (message: string) => void;
  error: (message: string) => void;
};

export async function requestUpstreamResponses(
  upstream: UpstreamConfig,
  payload: any,
  logger: TransportLogger,
  stateDir: string,
): Promise<UpstreamHttpResponse> {
  if (hasExplicitUpstreamProxyEnv()) {
    await appendUpstreamTransportTrace(stateDir, {
      stage: "transport_policy",
      upstreamBaseUrl: upstream.baseUrl,
      policy: "prefer_curl_due_to_proxy_env",
    });
    return requestUpstreamWithCurl(upstream, payload, stateDir);
  }
  try {
    const endpoint = upstreamEndpoint(upstream);
    const requestPayload = buildNonStreamingUpstreamRequestPayload(upstream, payload);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });
    const headers = Object.fromEntries(resp.headers.entries());
    const rawText = await resp.text();
    const rawContentType = headers["content-type"];
    const text = isCompletionsApiFamily(upstream.apiFamily)
      ? isSseContentType(rawContentType)
        ? convertChatCompletionsSseToResponsesText(rawText)
        : chatCompletionsToResponsesText(rawText)
      : rawText;
    return {
      status: resp.status,
      headers: isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(rawContentType)
        ? { ...headers, "content-type": "application/json; charset=utf-8" }
        : headers,
      text,
      transport: "fetch",
    };
  } catch (err) {
    const fetchDetail = err instanceof Error ? err.message : String(err);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "fetch_error",
      upstreamBaseUrl: upstream.baseUrl,
      error: fetchDetail,
    });
    logger.warn(`[plugin-runtime] upstream fetch failed, fallback to curl: ${fetchDetail}`);
    try {
      return await requestUpstreamWithCurl(upstream, payload, stateDir);
    } catch (curlErr) {
      const curlDetail = curlErr instanceof Error ? curlErr.message : String(curlErr);
      await appendUpstreamTransportTrace(stateDir, {
        stage: "fetch_then_curl_error",
        upstreamBaseUrl: upstream.baseUrl,
        fetchError: fetchDetail,
        curlError: curlDetail,
      });
      logger.error(`[plugin-runtime] upstream curl fallback failed: ${curlDetail}`);
      throw new Error(`upstream fetch failed (${fetchDetail}); curl fallback failed (${curlDetail})`);
    }
  }
}

export async function requestUpstreamResponsesStream(
  upstream: UpstreamConfig,
  payload: any,
  logger: TransportLogger,
  stateDir: string,
): Promise<UpstreamStreamResponse> {
  const endpoint = upstreamEndpoint(upstream);
  const requestPayload = buildUpstreamRequestPayload(upstream, payload);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });
    const headers = Object.fromEntries(resp.headers.entries());
    if (!resp.body) {
      return {
        status: resp.status,
        headers,
        stream: Readable.from([""]),
        transport: "fetch",
      };
    }
    const rawStream = Readable.fromWeb(resp.body as any);
    const stream = isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(headers["content-type"])
      ? rawStream.pipe(createChatCompletionsToResponsesSseTransform())
      : rawStream;
    const normalizedHeaders =
      isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(headers["content-type"])
        ? { ...headers, "content-type": "text/event-stream; charset=utf-8" }
        : headers;
    return {
      status: resp.status,
      headers: normalizedHeaders,
      stream,
      transport: "fetch",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "fetch_stream_error",
      upstreamBaseUrl: upstream.baseUrl,
      error: detail,
    });
    logger.error(`[plugin-runtime] upstream stream fetch failed: ${detail}`);
    throw new Error(`upstream stream fetch failed (${detail})`);
  }
}
