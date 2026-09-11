import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, setEmbeddingProvider, setIndexPersistence, setVectorIndex } from "../src/functions/search.js";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import type { EmbeddingProvider, ExportData, Memory } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config.js", () => ({ getAgentId: () => undefined, isAgentScopeIsolated: () => false }));

const memory = (id = "mem_test", content = "quartzunique"): Memory => ({
  id, title: content, content, type: "fact", createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z", concepts: [], files: [], sessionIds: [],
  strength: 7, version: 1, isLatest: true,
});
const payload = (memories = [memory()]) => ({
  strategy: "merge" as const, strictIndexing: true,
  exportData: { version: "0.9.29", exportedAt: "2026-09-11T00:00:00Z",
    sessions: [], observations: {}, memories, summaries: [] } satisfies ExportData,
});

describe("strict import indexing", () => {
  let kv: ReturnType<typeof mockKV>;
  let sdk: ReturnType<typeof mockSdk>;
  let vectors: VectorIndex;
  let persistence: IndexPersistence;
  let embedBatch: ReturnType<typeof vi.fn<EmbeddingProvider["embedBatch"]>>;

  beforeEach(() => {
    kv = mockKV();
    sdk = mockSdk();
    getSearchIndex().clear();
    vectors = new VectorIndex();
    setVectorIndex(vectors);
    embedBatch = vi.fn(async (texts) => texts.map(() => new Float32Array([1, 0])));
    setEmbeddingProvider({ name: "test", dimensions: 2, embed: async () => new Float32Array([1, 0]), embedBatch });
    persistence = new IndexPersistence(kv as never, getSearchIndex(), vectors);
    setIndexPersistence(persistence);
    registerExportImportFunction(sdk as never, kv as never);
    registerRememberFunction(sdk as never, kv as never);
  });

  afterEach(() => {
    persistence.stop();
    setIndexPersistence(null);
    setEmbeddingProvider(null);
    setVectorIndex(null);
    getSearchIndex().clear();
    vi.restoreAllMocks();
  });

  it("acknowledges both saved indexes, preserves IDs/text and retries without duplicates", async () => {
    const request = payload();
    const expected = { success: true, storage: "complete", indexing: { version: 1, mode: "strict",
      expected: 1, bm25Indexed: 1, vectorIndexed: 1, persisted: true } };
    expect(await sdk.trigger("mem::import", request)).toMatchObject(expected);
    const lexical = getSearchIndex().serialize();
    expect(await sdk.trigger("mem::import", request)).toMatchObject(expected);
    expect(getSearchIndex().serialize()).toBe(lexical);
    expect(await kv.list(KV.memories)).toHaveLength(1);
    expect(await kv.get(KV.memories, "mem_test")).toMatchObject({ id: "mem_test", content: "quartzunique" });
    const loaded = await persistence.load();
    expect(loaded.bm25!.search("quartzunique")[0].obsId).toBe("mem_test");
    expect(loaded.vector!.search(new Float32Array([1, 0]))[0].obsId).toBe("mem_test");
  });

  it("updates content and vectors, then deletes without stale results", async () => {
    await sdk.trigger("mem::import", payload());
    embedBatch.mockResolvedValueOnce([new Float32Array([0, 1])]);
    await sdk.trigger("mem::import", payload([memory("mem_test", "saffronunique")]));
    expect(getSearchIndex().search("quartzunique")).toEqual([]);
    expect(getSearchIndex().search("saffronunique")[0].obsId).toBe("mem_test");
    expect(vectors.search(new Float32Array([0, 1]))[0].score).toBe(1);
    await sdk.trigger("mem::import", payload([memory("mem_other", "saffronunique")]));
    await sdk.trigger("mem::forget", { memoryId: "mem_test" });
    const loaded = await persistence.load();
    expect(loaded.bm25!.search("quartzunique")).toEqual([]);
    expect(loaded.bm25!.search("saffronunique").map((hit) => hit.obsId)).toEqual(["mem_other"]);
    expect(loaded.vector!.size).toBe(1);
  });

  it("counts observations and memories together and preserves observation content", async () => {
    const request = payload();
    const exportData: ExportData = {
      ...request.exportData,
      sessions: [{ id: "ses_test", project: "test", cwd: "/test", status: "completed",
        startedAt: "2026-09-11T00:00:00Z", observationCount: 1 }],
      observations: { ses_test: [{ id: "obs_test", sessionId: "ses_test", timestamp: "2026-09-11T00:00:00Z",
        type: "decision", title: "saffronunique", narrative: "original narrative", facts: ["original fact"],
        concepts: [], files: [], importance: 7 }] },
    };
    expect(await sdk.trigger("mem::import", { ...request, exportData })).toMatchObject({
      success: true, indexing: { expected: 2, bm25Indexed: 2, vectorIndexed: 2, persisted: true },
    });
    expect(await kv.get(KV.observations("ses_test"), "obs_test")).toMatchObject({ narrative: "original narrative" });
    expect((await persistence.load()).bm25!.search("saffronunique")[0].obsId).toBe("obs_test");
  });

  it.each(["skip", "replace"])("rejects strict %s before writes", async (strategy) => {
    expect(await sdk.trigger("mem::import", { ...payload(), strategy })).toMatchObject({
      success: false, code: "INVALID_STRICT_IMPORT", storage: "not_started",
    });
    expect(kv.store.size).toBe(0);
  });

  it.each(["provider", "vectors", "persistence"])("rejects unavailable %s before writes", async (component) => {
    if (component === "provider") setEmbeddingProvider(null);
    if (component === "vectors") setVectorIndex(null);
    if (component === "persistence") setIndexPersistence(null);
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({
      success: false, code: "INDEXING_UNAVAILABLE", storage: "not_started",
    });
    expect(kv.store.size).toBe(0);
  });

  it.each([
    [memory(), memory()], [memory("mem_bad", "")], [{ ...memory(), isLatest: false }],
    [{ ...memory(), concepts: [null] }],
  ])("rejects nonindexable or duplicate records before writes", async (...records) => {
    expect(await sdk.trigger("mem::import", payload(records as Memory[]))).toMatchObject({
      success: false, code: "INVALID_STRICT_IMPORT", storage: "not_started",
    });
    expect(kv.store.size).toBe(0);
  });

  it.each(["throw", "length", "dimension", "NaN", "Infinity", "-Infinity"])("reports vector %s failure and repairs it on retry", async (failure) => {
    if (failure === "throw") embedBatch.mockRejectedValueOnce(new Error("embed unavailable"));
    if (failure === "length") embedBatch.mockResolvedValueOnce([]);
    if (failure === "dimension") embedBatch.mockResolvedValueOnce([new Float32Array([1])]);
    if (["NaN", "Infinity", "-Infinity"].includes(failure)) {
      embedBatch.mockResolvedValueOnce([new Float32Array([Number(failure), 0])]);
    }
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({
      success: false, code: "INDEXING_FAILED", storage: "complete",
      indexing: { expected: 1, bm25Indexed: 1, vectorIndexed: 0, persisted: false },
    });
    expect(await kv.list(KV.memories)).toHaveLength(1);
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({ success: true, indexing: { persisted: true } });
    expect(vectors.size).toBe(1);
  });

  it("reports partial vector completion rather than accepting the whole batch", async () => {
    embedBatch.mockResolvedValueOnce([new Float32Array([1, 0]), new Float32Array([1])]);
    expect(await sdk.trigger("mem::import", payload([memory(), memory("mem_second")]))).toMatchObject({
      success: false, indexing: { expected: 2, bm25Indexed: 2, vectorIndexed: 1, persisted: false },
    });
  });

  it("reports lexical failure with stored rows and succeeds after retry", async () => {
    vi.spyOn(getSearchIndex(), "add").mockImplementationOnce(() => { throw new Error("index unavailable"); });
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({
      success: false, storage: "complete", code: "INDEXING_FAILED", indexing: { bm25Indexed: 0, persisted: false },
    });
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({ success: true });
  });

  it.each(["data:manifest", "vectors:manifest"])("does not acknowledge failed %s persistence", async (key) => {
    const originalSet = kv.set;
    const failure = vi.spyOn(kv, "set").mockImplementation(async (scope, recordKey, value) => {
      if (scope === KV.bm25Index && recordKey === key) throw new Error("storage unavailable");
      return originalSet(scope, recordKey, value);
    });
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({
      success: false, code: "INDEX_PERSISTENCE_FAILED", storage: "complete",
      indexing: { bm25Indexed: 1, vectorIndexed: 1, persisted: false },
    });
    failure.mockRestore();
    expect(await sdk.trigger("mem::import", payload())).toMatchObject({ success: true, indexing: { persisted: true } });
  });

  it("does not claim storage completion when a KV write fails", async () => {
    vi.spyOn(kv, "set").mockRejectedValueOnce(new Error("state unavailable"));
    await expect(sdk.trigger("mem::import", payload())).rejects.toThrow("state unavailable");
  });

  it("keeps legacy best-effort import success and response shape", async () => {
    embedBatch.mockRejectedValueOnce(new Error("embed unavailable"));
    const result = await sdk.trigger("mem::import", { ...payload(), strictIndexing: undefined });
    expect(result).toEqual({ success: true, strategy: "merge", memories: 1, observations: 0, sessions: 0, summaries: 0, skipped: 0 });
  });
});
