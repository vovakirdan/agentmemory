import { describe, expect, it } from "vitest";
import {
  decodePageCursor,
  encodePageCursor,
  paginateByCursor,
  parseBooleanQuery,
  parsePageLimit,
} from "../src/api/pagination.js";

describe("API pagination helpers", () => {
  it("validates page limits and booleans", () => {
    expect(parsePageLimit(undefined)).toBe(50);
    expect(parsePageLimit("2")).toBe(2);
    expect(parsePageLimit("0")).toBeNull();
    expect(parsePageLimit("101")).toBeNull();
    expect(parseBooleanQuery("true")).toBe(true);
    expect(parseBooleanQuery("FALSE")).toBe(false);
    expect(parseBooleanQuery("yes")).toBeNull();
  });

  it("round-trips opaque cursors and rejects malformed values", () => {
    const cursor = { sortKey: "2026-09-06T12:00:00.000Z", id: "session-1" };
    expect(decodePageCursor(encodePageCursor(cursor))).toEqual(cursor);
    expect(decodePageCursor("not-a-cursor")).toBeNull();
  });

  it("returns stable descending pages", () => {
    const items = [
      { id: "a", at: "2026-09-06T00:00:00.000Z" },
      { id: "c", at: "2026-09-06T02:00:00.000Z" },
      { id: "b", at: "2026-09-06T01:00:00.000Z" },
    ];
    const first = paginateByCursor(items, (item) => item.at, (item) => item.id, 2);
    expect(first.items.map((item) => item.id)).toEqual(["c", "b"]);
    expect(first.hasMore).toBe(true);
    const next = paginateByCursor(
      items,
      (item) => item.at,
      (item) => item.id,
      2,
      decodePageCursor(first.nextCursor),
    );
    expect(next.items.map((item) => item.id)).toEqual(["a"]);
    expect(next.hasMore).toBe(false);
  });
});
