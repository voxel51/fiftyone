import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name) =>
  readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const communityScript = workflow("community-prs")
  .split("          script: |\n")[1]
  .split("\n")
  .map((line) => line.slice(12))
  .join("\n");
const route = new AsyncFunction("github", "context", communityScript);
const syncCondition = workflow("enterprise-sync")
  .split("    if: >-\n")[1]
  .split("    runs-on:")[0];
const shouldSync = new Function(
  "github",
  "startsWith",
  "endsWith",
  `return Boolean(${syncCondition});`,
);

function event() {
  return {
    action: "opened",
    pull_request: {
      number: 123,
      user: { login: "voxel51-autoworks[bot]", id: 331044789, type: "Bot" },
      head: { repo: { id: 257913595, full_name: "voxel51/fiftyone" } },
      base: { ref: "main" },
      draft: false,
    },
    changes: {},
  };
}

async function retargets(payload, permission = "read") {
  const updates = [];
  await route(
    {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async () => ({
            data: { permission },
          }),
        },
        pulls: { update: async (update) => updates.push(update) },
        issues: { listComments: {}, createComment: async () => {} },
      },
      paginate: async () => [],
    },
    { payload, repo: { owner: "voxel51", repo: "fiftyone" } },
  );
  return updates.length > 0;
}

function syncs(payload, repository = "voxel51/fiftyone") {
  return shouldSync(
    { repository, event: payload },
    (value, prefix) => value.startsWith(prefix),
    (value, suffix) => value.endsWith(suffix),
  );
}

describe("trusted App routing", () => {
  it.each(["main", "release/v1.16"])("preserves and syncs %s", async (base) => {
    const payload = event();
    payload.pull_request.base.ref = base;
    expect(await retargets(payload)).toBe(false);
    expect(syncs(payload)).toBe(true);
  });

  it.each([
    [
      "wrong ID",
      (pr) => {
        pr.user.id = 1;
      },
    ],
    [
      "other bot",
      (pr) => {
        pr.user.login = "dependabot[bot]";
      },
    ],
    [
      "wrong type",
      (pr) => {
        pr.user.type = "User";
      },
    ],
    [
      "fork",
      (pr) => {
        pr.head.repo.full_name = "other/fiftyone";
      },
    ],
    [
      "wrong repository ID",
      (pr) => {
        pr.head.repo.id = 1;
      },
    ],
    [
      "unsupported base",
      (pr) => {
        pr.base.ref = "feature";
      },
    ],
  ])("rejects %s", async (_name, change) => {
    const payload = event();
    change(payload.pull_request);
    expect(await retargets(payload)).toBe(true);
    expect(syncs(payload)).toBe(false);
  });

  it("preserves draft, event, and repository filters", () => {
    const payload = event();
    payload.pull_request.draft = true;
    expect(syncs(payload)).toBe(false);
    payload.action = "closed";
    expect(syncs(payload)).toBe(true);
    payload.pull_request.draft = false;
    payload.action = "edited";
    expect(syncs(payload)).toBe(false);
    payload.pull_request.base.ref = "community";
    payload.changes.base = { ref: { from: "main" } };
    expect(syncs(payload)).toBe(true);
    expect(syncs(payload, "voxel51/fiftyone-teams")).toBe(false);
  });

  it("keeps human collaborator routing unchanged", async () => {
    const payload = event();
    payload.pull_request.user = { login: "maintainer", id: 2, type: "User" };
    expect(await retargets(payload, "write")).toBe(false);
    expect(syncs(payload)).toBe(true);
    expect(await retargets(payload, "read")).toBe(true);
  });
});
