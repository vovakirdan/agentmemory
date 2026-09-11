import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const model = "Xenova/all-MiniLM-L6-v2";
const revision = "751bff37182d3f1213fa05d7196b954e230abad9";
const files = ["config.json", "tokenizer.json", "tokenizer_config.json",
  "special_tokens_map.json", "vocab.txt", "onnx/model_quantized.onnx"];
const manifest = { model, revision, files: {} };

for (const name of files) {
  const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${name}`, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Model asset ${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = join("/opt/agentmemory/models", model, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  manifest.files[name] = createHash("sha256").update(bytes).digest("hex");
}
await writeFile("/opt/agentmemory/models/manifest.json", JSON.stringify(manifest, null, 2));
