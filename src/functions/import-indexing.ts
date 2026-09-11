import type { CompressedObservation, ExportData, Memory } from "../types.js";
import {
  flushIndexSave,
  getEmbeddingProvider,
  getVectorIndex,
  hasIndexPersistence,
  indexRecords,
  type IndexingProgress,
} from "./search.js";

export interface StrictIndexingReport extends IndexingProgress {
  version: 1;
  mode: "strict";
  expected: number;
  persisted: boolean;
}

type ImportErrorCode =
  | "INVALID_STRICT_IMPORT"
  | "INDEXING_UNAVAILABLE"
  | "INDEXING_FAILED"
  | "INDEX_PERSISTENCE_FAILED";

export interface StrictImportError {
  success: false;
  code: ImportErrorCode;
  error: string;
  storage: "not_started" | "complete";
  indexing?: StrictIndexingReport;
}

export function invalidStrictImport(error: string): StrictImportError {
  return { success: false, code: "INVALID_STRICT_IMPORT", error, storage: "not_started" };
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export function validateStrictImport(
  data: ExportData,
  strategy: string,
): StrictImportError | undefined {
  if (strategy !== "merge") return invalidStrictImport("strictIndexing requires strategy merge");
  const ids = new Set<string>();
  const validate = (record: Memory | CompressedObservation, text: unknown): boolean => {
    if (!record || !nonempty(record.id) || !nonempty(record.title) || !nonempty(text)
      || !strings(record.concepts) || !strings(record.files) || ids.has(record.id)) return false;
    ids.add(record.id);
    return true;
  };
  for (const memory of data.memories) {
    if (!validate(memory, memory?.content) || memory.isLatest === false
      || !nonempty(memory.createdAt)
      || (memory.sessionIds !== undefined && !strings(memory.sessionIds))) {
      return invalidStrictImport("strictIndexing requires unique, current, indexable memories");
    }
  }
  for (const [sessionId, observations] of Object.entries(data.observations)) {
    for (const observation of observations) {
      if (!validate(observation, observation?.narrative) || observation.sessionId !== sessionId
        || !nonempty(observation.timestamp) || !strings(observation.facts)) {
        return invalidStrictImport("strictIndexing requires unique, indexable observations in their session bucket");
      }
    }
  }
  if (!getEmbeddingProvider() || !getVectorIndex() || !hasIndexPersistence()) {
    return {
      success: false, code: "INDEXING_UNAVAILABLE", storage: "not_started",
      error: "strictIndexing requires an embedding provider, vector index and index persistence",
    };
  }
}

export async function strictImportIndexing(
  observations: CompressedObservation[],
  memories: Memory[],
): Promise<{ success: true; storage: "complete"; indexing: StrictIndexingReport } | StrictImportError> {
  const indexing: StrictIndexingReport = {
    version: 1, mode: "strict", expected: observations.length + memories.length,
    bm25Indexed: 0, vectorIndexed: 0, persisted: false,
  };
  const failure = (code: ImportErrorCode, error: string): StrictImportError =>
    ({ success: false, code, error, storage: "complete", indexing });
  try {
    await indexRecords(observations, memories, indexing);
  } catch {
    return failure("INDEXING_FAILED", "Import stored; search indexing did not complete");
  }
  if (indexing.bm25Indexed !== indexing.expected || indexing.vectorIndexed !== indexing.expected) {
    return failure("INDEXING_FAILED", "Import stored; not all records reached both search indexes");
  }
  try {
    await flushIndexSave({ strict: true });
  } catch {
    return failure("INDEX_PERSISTENCE_FAILED", "Import stored and indexed; index persistence did not complete");
  }
  indexing.persisted = true;
  return { success: true, storage: "complete", indexing };
}
