import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config.js", () => ({ loadConfig: () => ({ streamsPort: 3112 }) }));

describe("strict import REST contract", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let importer: ReturnType<typeof vi.fn>;
  const request = (body: unknown, authorization = "Bearer test-secret") =>
    sdk.trigger("api::import", { body, headers: { authorization } }) as Promise<{ status_code: number; body: unknown }>;

  beforeEach(() => {
    sdk = mockSdk();
    importer = vi.fn(async () => ({ success: true }));
    sdk.registerFunction("mem::import", importer);
    registerApiTriggers(sdk as never, mockKV() as never, "test-secret");
  });

  it("requires authentication before dispatch", async () => {
    expect((await request({ exportData: {}, strictIndexing: true }, "Bearer wrong")).status_code).toBe(401);
    expect(importer).not.toHaveBeenCalled();
  });

  it("rejects malformed opt-in and whitelists import fields", async () => {
    expect((await request({ exportData: {}, strictIndexing: "true" })).status_code).toBe(400);
    expect(importer).not.toHaveBeenCalled();
    const body = { exportData: {}, strategy: "merge", strictIndexing: true };
    expect((await request({ ...body, injected: "discard" })).status_code).toBe(200);
    expect(importer).toHaveBeenCalledWith(body);
  });

  it.each([
    ["INVALID_STRICT_IMPORT", 400], ["INDEXING_UNAVAILABLE", 503],
    ["INDEXING_FAILED", 503], ["INDEX_PERSISTENCE_FAILED", 503],
  ])("maps %s to HTTP %s only for strict requests", async (code, status) => {
    const result = { success: false, code, storage: "complete", indexing: { persisted: false } };
    importer.mockResolvedValue(result);
    expect(await request({ exportData: {}, strictIndexing: true })).toEqual({ status_code: status, body: result });
    expect((await request({ exportData: {} })).status_code).toBe(200);
  });

  it("maps legacy validation failures to 400 under strict mode", async () => {
    importer.mockResolvedValue({ success: false, error: "sessions must be an array" });
    expect((await request({ exportData: {}, strictIndexing: true })).status_code).toBe(400);
  });
});
