// Lists the spec files a PR adds or modifies, one path per line relative to
// e2e-pw/ (ready for `yarn e2e $FILES`). New and edited specs are burned in
// (repeated runs with retries disabled) before they can join the suite.
//
// The list comes from the PR files API rather than a local git diff: it is
// computed against the merge base without needing branch history in the
// (shallow) CI checkout, and it works identically in fiftyone-teams.
//
// Empty output means nothing to burn in. Exits non-zero only when a PR run
// cannot determine its file list (fail closed: the burn-in job goes red and
// the verdict fails rather than silently skipping the gate).
//
// Usage: node scripts/burn-in-specs.mjs
// Env: PR_NUMBER (absent on non-PR runs -> empty output), GH_TOKEN,
// GITHUB_REPOSITORY, GITHUB_API_URL (defaults to https://api.github.com)

const SPEC_PATTERN = /^e2e-pw\/src\/.+\.spec\.tsx?$/;

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

const specs = [];
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
    if (touched && SPEC_PATTERN.test(file.filename)) {
      specs.push(file.filename.replace(/^e2e-pw\//, ""));
    }
  }
  if (files.length < 100) {
    break;
  }
}

console.log(specs.sort().join("\n"));
