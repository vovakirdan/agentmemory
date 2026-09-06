export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export interface PageCursor {
  sortKey: string;
  id: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export function parsePageLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PAGE_LIMIT;
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PAGE_LIMIT
    ? value
    : null;
}

export function parseBooleanQuery(raw: string | undefined): boolean | undefined | null {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function encodePageCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePageCursor(raw: string | undefined): PageCursor | undefined | null {
  if (raw === undefined || raw.trim() === "") return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<PageCursor>;
    if (typeof decoded.sortKey !== "string" || typeof decoded.id !== "string") return null;
    return { sortKey: decoded.sortKey, id: decoded.id };
  } catch {
    return null;
  }
}

export function paginateByCursor<T>(
  items: T[],
  getSortKey: (item: T) => string | undefined,
  getId: (item: T) => string | undefined,
  limit: number,
  cursor?: PageCursor,
): Page<T> {
  const sorted = [...items].sort((a, b) => {
    const keyOrder = (getSortKey(b) ?? "").localeCompare(getSortKey(a) ?? "");
    return keyOrder || (getId(b) ?? "").localeCompare(getId(a) ?? "");
  });
  const start = cursor
    ? sorted.findIndex((item) => {
        const key = getSortKey(item) ?? "";
        const id = getId(item) ?? "";
        return key < cursor.sortKey || (key === cursor.sortKey && id < cursor.id);
      })
    : 0;
  const offset = start < 0 ? sorted.length : start;
  const pageItems = sorted.slice(offset, offset + limit);
  const hasMore = offset + pageItems.length < sorted.length;
  const last = pageItems[pageItems.length - 1];
  return {
    items: pageItems,
    hasMore,
    ...(hasMore && last
      ? { nextCursor: encodePageCursor({ sortKey: getSortKey(last) ?? "", id: getId(last) ?? "" }) }
      : {}),
  };
}
