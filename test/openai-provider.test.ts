import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAIProvider,
  resolveMaxTokensParameter,
} from "../src/providers/openai.js";

describe("resolveMaxTokensParameter", () => {
  it("uses max_completion_tokens for o-series models", () => {
    expect(resolveMaxTokensParameter("o3-mini")).toBe("max_completion_tokens");
    expect(resolveMaxTokensParameter("o1-2024-12-17")).toBe(
      "max_completion_tokens",
    );
  });

  it("uses max_completion_tokens for GPT-5 models", () => {
    expect(resolveMaxTokensParameter("gpt-5.6-luna")).toBe(
      "max_completion_tokens",
    );
  });

  it("keeps max_tokens for older and compatible models", () => {
    expect(resolveMaxTokensParameter("gpt-4o-mini")).toBe("max_tokens");
    expect(resolveMaxTokensParameter("deepseek-chat")).toBe("max_tokens");
  });

  it("honors an explicit compatibility override", () => {
    expect(resolveMaxTokensParameter("gpt-5", "max_tokens")).toBe("max_tokens");
    expect(resolveMaxTokensParameter("gpt-4o", "max_completion_tokens")).toBe(
      "max_completion_tokens",
    );
  });
});

describe("OpenAIProvider token-limit parameter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["OPENAI_MAX_TOKENS_PARAM"];
  });

  it("sends max_completion_tokens to GPT-5 models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("test-key", "gpt-5.6-luna", 321);
    await provider.compress("system", "user");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.max_completion_tokens).toBe(321);
    expect(request.max_tokens).toBeUndefined();
  });

  it("keeps max_tokens for older compatible models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 123);
    await provider.compress("system", "user");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.max_tokens).toBe(123);
    expect(request.max_completion_tokens).toBeUndefined();
  });
});
