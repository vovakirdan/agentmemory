# Strict import indexing

`POST /agentmemory/import` accepts the optional boolean `strictIndexing`.
Omitting it, or setting it to `false`, preserves the existing best-effort import
response and indexing behavior.

Strict indexing requires `strategy: "merge"` (also the default), an embedding
provider, a vector index, and configured index persistence. Imported memories
must be current and have nonempty IDs, titles and content; observations need
IDs, titles, narratives and a matching session bucket. IDs must be unique across
the request. Required string arrays must contain strings. Invalid input returns
400 before writes; unavailable indexing components return 503 with
`storage: "not_started"`.

A completed strict import returns HTTP 200:

```json
{
  "success": true,
  "strategy": "merge",
  "sessions": 0,
  "observations": 0,
  "memories": 1,
  "summaries": 0,
  "skipped": 0,
  "storage": "complete",
  "indexing": {
    "version": 1,
    "mode": "strict",
    "expected": 1,
    "bm25Indexed": 1,
    "vectorIndexed": 1,
    "persisted": true
  }
}
```

`expected` counts imported memories and observations. Success confirms that all
KV writes completed, every expected record reached both in-memory search
indexes, and both index snapshots were saved through the configured StateKV.
It does not add a transaction spanning records and indexes or change StateKV's
durability guarantees. Other imported collections are stored as before; this
acknowledgement covers BM25 and vector indexing of memories and observations.

Indexing failure returns 503, `success: false`, `storage: "complete"`, the actual
indexing counters and `persisted: false`. The code is `INDEXING_FAILED` or
`INDEX_PERSISTENCE_FAILED`. Stored records are retained. Replay the same payload
with `merge` and `strictIndexing: true` to repair a partial result. KV/transport
errors have an uncertain write outcome and must not be interpreted as rollback.

Clients must validate the complete acknowledgement, including `version: 1` and
`mode: "strict"`; older servers may ignore the request option. Serialize writes
to the same ID. Immutable IDs per content revision prevent a delayed older
request from overwriting a newer revision; the API does not provide revision CAS
or ordering between independent writers.

Project and agent filters are retrieval filters, not authorization boundaries.
Applications must authorize and rehydrate results from their authoritative data.
