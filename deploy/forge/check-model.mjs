import assert from "node:assert/strict";
import { pipeline } from "@huggingface/transformers";

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
const output = await extractor(["offline local embedding check"], { pooling: "mean", normalize: true });
const [vector] = output.tolist();
assert.equal(vector.length, 384);
assert(vector.every(Number.isFinite));
console.log("Pinned local embedding assets verified: 384 finite dimensions");
