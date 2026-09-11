#!/bin/sh
set -eu

if [ -z "${AGENTMEMORY_SECRET:-}" ]; then
  printf '%s\n' 'AGENTMEMORY_SECRET is required' >&2
  exit 1
fi

for key in OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY GOOGLE_API_KEY \
  OPENROUTER_API_KEY MINIMAX_API_KEY VOYAGE_API_KEY COHERE_API_KEY \
  OPENAI_BASE_URL ANTHROPIC_BASE_URL FALLBACK_PROVIDERS; do
  unset "$key"
done
export EMBEDDING_PROVIDER=local AUTO_FORGET_ENABLED=false CONSOLIDATION_ENABLED=false
export AGENTMEMORY_AUTO_COMPRESS=false AGENTMEMORY_ALLOW_AGENT_SDK=false
export AGENTMEMORY_REFLECT=false AGENTMEMORY_INJECT_CONTEXT=false
export LESSON_DECAY_ENABLED=false INSIGHT_DECAY_ENABLED=false
export GRAPH_EXTRACTION_ENABLED=false SNAPSHOT_ENABLED=false
export NODE_OPTIONS=--import=/opt/agentmemory/deploy/forge/offline-model.mjs
export AGENTMEMORY_DATA_DIR=/data AGENTMEMORY_RUNTIME_DIR=/data

test -w /data || { printf '%s\n' '/data must be writable by uid 1000' >&2; exit 1; }
exec /usr/local/bin/iii --config /opt/agentmemory/deploy/forge/iii-config.yaml
