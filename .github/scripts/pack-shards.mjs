// Prints the spec files for one CI shard, greedy bin-packed by expected
// duration (see shard-plan.mjs) so no shard is bottlenecked by the heavy
// spec families.
//
// Usage: node scripts/pack-shards.mjs <shard> <total>

import { join } from "node:path";

import { listSpecFiles, packShards, readTimings } from "./shard-plan.mjs";

const [, , shardArg, totalArg] = process.argv;
const shard = Number(shardArg);
const total = Number(totalArg);
if (!shard || !total || shard < 1 || shard > total) {
  console.error("usage: node scripts/pack-shards.mjs <shard> <total>");
  process.exit(1);
}

const bins = packShards(listSpecFiles(), readTimings(), total);
console.log(bins[shard - 1].files.map((f) => join("src", f)).join("\n"));
