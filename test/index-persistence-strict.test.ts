import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation } from "../src/types.js";
import { mockKV } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const observation = (title: string): CompressedObservation => ({
  id: "obs_test", sessionId: "ses_test", timestamp: "2026-09-11T00:00:00Z",
  title, narrative: title, type: "decision", facts: [], concepts: [], files: [], importance: 5,
});

afterEach(() => vi.useRealTimers());

describe("serialized strict persistence", () => {
  it("queues a strict snapshot after an in-flight debounced save", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    const bm25 = new SearchIndex();
    const vectors = new VectorIndex();
    bm25.add(observation("quartzunique"));
    vectors.add("obs_test", "ses_test", new Float32Array([1, 0]));
    const firstStarted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const originalSet = kv.set;
    let manifests = 0;
    vi.spyOn(kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.bm25Index && key === "data:manifest" && ++manifests === 1) {
        firstStarted.resolve();
        await release.promise;
      }
      return originalSet(scope, key, value);
    });
    const persistence = new IndexPersistence(kv as never, bm25, vectors);
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(5000);
    await firstStarted.promise;
    bm25.add(observation("saffronunique"));
    vectors.add("obs_test", "ses_test", new Float32Array([0, 1]));
    let complete = false;
    const strict = persistence.save({ strict: true }).then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    expect(manifests).toBe(1);
    release.resolve();
    await strict;
    const loaded = await persistence.load();
    expect(manifests).toBe(2);
    expect(loaded.bm25!.search("quartzunique")).toEqual([]);
    expect(loaded.bm25!.search("saffronunique")[0].obsId).toBe("obs_test");
    expect(loaded.vector!.search(new Float32Array([0, 1]))[0].score).toBe(1);
  });

  it("propagates a strict failure without poisoning subsequent saves", async () => {
    const kv = mockKV();
    const bm25 = new SearchIndex();
    bm25.add(observation("quartzunique"));
    const originalSet = kv.set;
    let fail = true;
    vi.spyOn(kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.bm25Index && key === "data:manifest" && fail) {
        fail = false;
        throw new Error("manifest unavailable");
      }
      return originalSet(scope, key, value);
    });
    const persistence = new IndexPersistence(kv as never, bm25, null);
    const first = persistence.save({ strict: true });
    const second = persistence.save({ strict: true });
    await expect(first).rejects.toThrow("manifest unavailable");
    await expect(second).resolves.toBeUndefined();
    expect((await persistence.load()).bm25!.search("quartzunique")).toHaveLength(1);
  });

  it("keeps default persistence failure non-throwing", async () => {
    const kv = mockKV();
    vi.spyOn(kv, "set").mockRejectedValue(new Error("state unavailable"));
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), null);
    await expect(persistence.save()).resolves.toBeUndefined();
    await expect(persistence.save({ strict: true })).rejects.toThrow("state unavailable");
  });
});
