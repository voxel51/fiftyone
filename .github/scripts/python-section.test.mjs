import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  PYTHON_LINE_MARKER,
  buildPythonFailures,
  buildPythonLine,
  collectResults,
  hasPythonJobs,
  parseJunit,
} from "./python-section.mjs";

const JUNIT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" errors="0" failures="1" skipped="1" tests="4" time="12.3">
    <testcase classname="tests.unittests.foo" name="test_pass" time="0.512" />
    <testcase classname="tests.unittests.foo" name="test_fail" time="3.204">
      <failure message="assert 1 == 2">traceback</failure>
    </testcase>
    <testcase classname="tests.unittests.bar" name="test_error" time="0.1">
      <error message="boom">traceback</error>
    </testcase>
    <testcase classname="tests.unittests.bar" name="test_skip" time="0">
      <skipped message="not on CI" />
    </testcase>
  </testsuite>
</testsuites>
`;

const job = (name, started, completed) => ({
  name,
  conclusion: completed ? "success" : null,
  started_at: started,
  completed_at: completed,
});

const JOBS = [
  job(
    "test / test-python (ubuntu-latest, 3.10)",
    "2026-07-23T10:00:00Z",
    "2026-07-23T10:31:00Z",
  ),
  job(
    "test / test-python (ubuntu-latest, 3.13)",
    "2026-07-23T10:00:30Z",
    "2026-07-23T10:29:00Z",
  ),
  job("e2e / Run e2e shard 1/8", "2026-07-23T10:00:00Z", "2026-07-23T10:24:00Z"),
];

describe("parseJunit", () => {
  it("classifies pass, failure, error, and skip with timing", () => {
    expect(parseJunit(JUNIT)).toEqual([
      { id: "tests.unittests.foo::test_pass", time: 512, status: "passed" },
      { id: "tests.unittests.foo::test_fail", time: 3204, status: "failed" },
      { id: "tests.unittests.bar::test_error", time: 100, status: "failed" },
      { id: "tests.unittests.bar::test_skip", time: 0, status: "skipped" },
    ]);
  });

  it("tolerates a missing classname", () => {
    expect(parseJunit(`<testcase name="test_x" time="1" />`)).toEqual([
      { id: "test_x", time: 1000, status: "passed" },
    ]);
  });
});

describe("buildPythonLine", () => {
  const results = [
    { version: "3.10", cases: parseJunit(JUNIT) },
    {
      version: "3.13",
      cases: parseJunit(JUNIT).map((c) =>
        c.id.endsWith("test_error") ? { ...c, status: "passed" } : c,
      ),
    },
  ];

  it("counts distinct failures across versions with the matrix clock", () => {
    const line = buildPythonLine(JOBS, results);
    expect(line).toContain("**python**: ❌ 2 failed");
    expect(line).toContain("· ⏱ 31m 0s");
    expect(line).toContain(PYTHON_LINE_MARKER);
  });

  it("reads healthy when nothing failed", () => {
    const green = results.map((r) => ({
      ...r,
      cases: r.cases.map((c) =>
        c.status === "failed" ? { ...c, status: "passed" } : c,
      ),
    }));
    expect(buildPythonLine(JOBS, green)).toContain(
      "**python**: ✅ 3 passed · 1 skipped",
    );
  });

  it("says so when the job failed without a report", () => {
    const dead = [{ ...JOBS[0], conclusion: "failure" }];
    expect(buildPythonLine(dead, [])).toContain(
      "❌ job failed with no test report",
    );
  });
});

describe("buildPythonFailures", () => {
  it("lists each failing test once with per-version timing", () => {
    const results = [
      { version: "3.10", cases: parseJunit(JUNIT) },
      {
        version: "3.13",
        cases: [
          {
            id: "tests.unittests.foo::test_fail",
            time: 2900,
            status: "passed",
          },
        ],
      },
    ];
    const lines = buildPythonFailures(results);
    expect(lines[0]).toBe("### Python failures");
    expect(lines).toContain(
      "- `tests.unittests.bar::test_error` — ❌ 0.1s (3.10)",
    );
    expect(lines).toContain(
      "- `tests.unittests.foo::test_fail` — ❌ 3.2s (3.10) · ✅ 2.9s (3.13)",
    );
  });

  it("is empty when nothing failed", () => {
    expect(
      buildPythonFailures([
        {
          version: "3.10",
          cases: [{ id: "t", time: 1, status: "passed" }],
        },
      ]),
    ).toEqual([]);
  });
});

describe("collectResults", () => {
  const dir = mkdtempSync(join(tmpdir(), "python-section-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads one result set per pytest-results-* artifact directory", () => {
    for (const version of ["3.13", "3.10"]) {
      const leg = join(dir, `pytest-results-${version}`, "nested");
      mkdirSync(leg, { recursive: true });
      writeFileSync(join(leg, "main.xml"), JUNIT);
    }
    writeFileSync(join(dir, "stray.txt"), "ignored");
    const results = collectResults(dir);
    expect(results.map((r) => r.version)).toEqual(["3.10", "3.13"]);
    expect(results[0].cases).toHaveLength(4);
  });

  it("returns nothing for a missing directory", () => {
    expect(collectResults(join(dir, "absent"))).toEqual([]);
  });
});

describe("hasPythonJobs", () => {
  it("sees running or concluded python jobs, ignoring skipped ones", () => {
    expect(hasPythonJobs(JOBS)).toBe(true);
    expect(hasPythonJobs([JOBS[2]])).toBe(false);
    expect(
      hasPythonJobs([{ ...JOBS[0], conclusion: "skipped" }]),
    ).toBe(false);
  });
});
