import { describe, expect, it } from "vitest";

import { settleHeadline } from "./suite-rows.mjs";

const body = (headline, e2e = "✅") => [
  "<!-- ci-report:OSS -->",
  headline,
  "",
  "| suite | result |",
  "| --- | --- |",
  "| build | ✅ |",
  `| e2e | ${e2e} |`,
];

describe("settleHeadline", () => {
  it("downgrades the verdict headline when a suite row failed", () => {
    const lines = body("## ✅ CI (OSS)");
    settleHeadline(lines, ["| test-windows | ❌ |"]);
    expect(lines[1]).toBe("## ❌ CI (OSS)");
  });

  it("downgrades a flaky-run headline the same way", () => {
    const lines = body("## ⚠️ CI (OSS): incomplete e2e run");
    settleHeadline(lines, ["| test | ❌ |"]);
    expect(lines[1]).toBe("## ❌ CI (OSS): incomplete e2e run");
  });

  it("lifts its own downgrade once a rerun turns every row green", () => {
    const lines = body("## ❌ CI (OSS)");
    settleHeadline(lines, ["| test-windows | ✅ |"]);
    expect(lines[1]).toBe("## ✅ CI (OSS)");
  });

  it("never lifts a verdict ❌, which always carries a reason", () => {
    const lines = body("## ❌ CI (OSS): 2 failed specs", "❌");
    settleHeadline(lines, ["| build | ✅ |"]);
    expect(lines[1]).toBe("## ❌ CI (OSS): 2 failed specs");
  });

  it("never lifts a plain ❌ while the e2e row is still red", () => {
    const lines = body("## ❌ CI (OSS)", "❌");
    settleHeadline(lines, ["| build | ✅ |"]);
    expect(lines[1]).toBe("## ❌ CI (OSS)");
  });

  it("leaves a green headline alone", () => {
    const lines = body("## ✅ CI (OSS)");
    settleHeadline(lines, ["| build | ✅ |"]);
    expect(lines[1]).toBe("## ✅ CI (OSS)");
  });

  it("tolerates a body with no headline", () => {
    const lines = ["| suite | result |", "| e2e | ✅ |"];
    expect(() => settleHeadline(lines, [])).not.toThrow();
  });
});
