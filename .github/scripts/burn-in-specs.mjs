// Lists the burn-in targets a PR adds or modifies, one per line relative to
// e2e-pw/ (ready for `yarn e2e $TARGETS`). A target is either a single test,
// as `src/oss/specs/foo.spec.ts:42` (the test declaration's line), or a whole
// spec file when every test in it is affected: the file is new, the diff
// touches shared code (imports, hooks, describe wrappers, helpers), or the
// diff cannot be mapped confidently to test blocks. New and edited tests are
// burned in (repeated runs with retries disabled) before they join the suite.
//
// The diff comes from the PR files API rather than a local git diff: it is
// computed against the merge base without needing branch history in the
// (shallow) CI checkout, and it works identically in fiftyone-teams.
//
// The API patch is relative to the PR head while CI checks out the PR merge
// commit, so every new-side hunk line is verified against the file on disk;
// any drift (the base branch also edited the file) falls back to the whole
// file rather than risk pointing Playwright at the wrong test.
//
// Empty output means nothing to burn in. Exits non-zero only when a PR run
// cannot determine its file list (fail closed: the burn-in job goes red and
// the verdict fails rather than silently skipping the gate).
//
// Usage: node scripts/burn-in-specs.mjs
// Env: PR_NUMBER (absent on non-PR runs -> empty output), GH_TOKEN,
// GITHUB_REPOSITORY, GITHUB_API_URL (defaults to https://api.github.com)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SPEC_PATTERN = /^e2e-pw\/src\/.+\.spec\.tsx?$/;

// test() with an optional modifier; test.describe/test.beforeEach etc.
// deliberately do not match -- edits to them affect the whole file
const TEST_DECL = /^\s*test(?:\.(?:skip|fixme|only|fail))?\s*\(/;

/**
 * Mark each character of source as code (true) or string/comment content
 * (false), so bracket matching ignores brackets inside literals. Template
 * literals nest: `${}` interiors are code. Regex literals are not modeled.
 */
export const codeMask = (source) => {
  const mask = new Array(source.length).fill(false);
  const templateBraces = [];
  let state = "code";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
      } else if (c === "/" && next === "*") {
        state = "block";
        i++;
      } else if (c === "'" || c === '"') {
        state = c;
      } else if (c === "`") {
        state = "template";
        templateBraces.push(0);
      } else if (templateBraces.length && c === "{") {
        templateBraces[templateBraces.length - 1]++;
        mask[i] = true;
      } else if (templateBraces.length && c === "}") {
        if (templateBraces[templateBraces.length - 1] === 0) {
          state = "template";
        } else {
          templateBraces[templateBraces.length - 1]--;
          mask[i] = true;
        }
      } else {
        mask[i] = true;
      }
    } else if (state === "line") {
      if (c === "\n") {
        state = "code";
      }
    } else if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i++;
      }
    } else if (state === "'" || state === '"') {
      if (c === "\\") {
        i++;
      } else if (c === state) {
        state = "code";
      }
    } else if (state === "template") {
      if (c === "\\") {
        i++;
      } else if (c === "$" && next === "{") {
        state = "code";
        i++;
      } else if (c === "`") {
        state = "code";
        templateBraces.pop();
      }
    }
  }
  return mask;
};

/**
 * 1-indexed { line, endLine } spans of test() blocks, from each declaration
 * to its call's closing paren. Returns null when a call is unbalanced (the
 * caller falls back to the whole file).
 */
export const testSpans = (source) => {
  const mask = codeMask(source);
  const lines = source.split("\n");
  const lineStarts = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const spans = [];
  for (let ln = 0; ln < lines.length; ln++) {
    if (!TEST_DECL.test(lines[ln])) {
      continue;
    }
    const declStart = lineStarts[ln] + lines[ln].indexOf("test");
    if (!mask[declStart]) {
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = source.indexOf("(", declStart); i < source.length; i++) {
      if (!mask[i]) {
        continue;
      }
      if (source[i] === "(") {
        depth++;
      } else if (source[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) {
      return null;
    }
    const endLine = source.slice(0, end).split("\n").length;
    spans.push({ line: ln + 1, endLine });
  }
  return spans;
};

/**
 * New-side line numbers a unified-diff patch touches, plus (line, text)
 * pairs that exist on the new side for verification against disk. A
 * deletion is attributed to the line now occupying its position.
 */
export const patchTouches = (patch) => {
  const touched = new Set();
  const verify = [];
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
    } else if (raw.startsWith("+")) {
      touched.add(newLine);
      verify.push([newLine, raw.slice(1)]);
      newLine++;
    } else if (raw.startsWith("-")) {
      touched.add(newLine);
    } else if (raw.startsWith(" ")) {
      verify.push([newLine, raw.slice(1)]);
      newLine++;
    }
  }
  return { touched, verify };
};

/** Burn-in targets for one modified spec file. */
export const fileTargets = (path, patch, source) => {
  if (!patch) {
    // the files API omits the patch for very large diffs
    return [path];
  }
  const spans = testSpans(source);
  if (!spans) {
    return [path];
  }
  const lines = source.split("\n");
  const { touched, verify } = patchTouches(patch);
  for (const [ln, text] of verify) {
    if (lines[ln - 1] !== text) {
      return [path];
    }
  }
  const hits = new Set();
  for (const ln of touched) {
    const span = spans.find((s) => ln >= s.line && ln <= s.endLine);
    if (!span) {
      return [path];
    }
    hits.add(span.line);
  }
  return [...hits].sort((a, b) => a - b).map((line) => `${path}:${line}`);
};

const main = async () => {
  const pr = process.env.PR_NUMBER;
  if (!pr) {
    process.exit(0);
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repo || !token) {
    console.error("burn-in-specs: GH_TOKEN and GITHUB_REPOSITORY are required");
    process.exit(1);
  }
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";

  const targets = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${api}/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      console.error(
        `burn-in-specs: PR files API returned ${response.status} for page ${page}`,
      );
      process.exit(1);
    }
    const files = await response.json();
    for (const file of files) {
      // a pure rename (changes === 0) is not new test code; a rename with
      // edits, an added file, or a modified file is
      const touched =
        file.status === "added" ||
        file.status === "modified" ||
        (file.status === "renamed" && file.changes > 0);
      if (!touched || !SPEC_PATTERN.test(file.filename)) {
        continue;
      }
      const path = file.filename.replace(/^e2e-pw\//, "");
      if (file.status === "added") {
        targets.push(path);
        continue;
      }
      let source;
      try {
        source = readFileSync(path, "utf8");
      } catch {
        targets.push(path);
        continue;
      }
      targets.push(...fileTargets(path, file.patch, source));
    }
    if (files.length < 100) {
      break;
    }
  }

  console.log(targets.sort().join("\n"));
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
