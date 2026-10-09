# AGENTS.md — FiftyOne App

Instructions for AI coding agents working on the FiftyOne App (this directory).
`CODING_STANDARDS.md`, alongside this file, is binding — read it too.

## Design system

App UI is built with VOODO (`@voxel51/voodo`), Voxel51's component library.
Reach for VOODO first, always.

Much of this codebase predates VOODO and is written in Material UI, so **the
surrounding code is not a reliable guide**. Matching the local idiom will
produce MUI, which is what we are migrating away from. Older VOODO code here
also uses retired styles (enum members, size-only text variants); don't copy
those either.

VOODO is newer than most models' training data, so look its API up in the
installed package (2.1.0 or later) instead of recalling it:

    npx @voxel51/voodo list          # every component, one line each
    npx @voxel51/voodo docs Button   # props, docs, and allowed token values

Rules the docs don't spell out:

- Token props take plain strings, not enum members: `size="sm"`,
  `variant="primary"`.
- `Text` uses the role variants, picked by pixel size: `body-primary` (15px),
  `body-secondary` (14px), `body-tertiary` (12px), `heading-*`, `label`. The
  size-only variants (`"sm"`, `"md"`, …) are deprecated.
- Colors come from tokens. Never hardcode `var(--...)` strings or hex values.
- Map Tailwind designs, including the Lovable mocks, by pixel size, not class
  name: `text-sm` / `text-body-sm` (14px) is `body-secondary`, not `"sm"`
  (12px). Before porting a Lovable mock, run `/hal lovable` for the full
  mapping.

For patterns and conventions, see the `fiftyone-voodo-design` skill in
[fiftyone-skills](https://github.com/voxel51/fiftyone-skills).

If you genuinely need a component VOODO does not have, use MUI, and say so in
the PR description along with which gap you hit. Never substitute MUI silently.

## Material UI freeze (this directory)

New `@mui/*` imports in `app/` are frozen by an ESLint rule against a shrinking
allowlist; do not add files to that allowlist to work around it, and do not
dodge the rule by importing the same primitives from sibling packages
(`@mui/system`, `@mui/base`, `@mui/lab`). `CODING_STANDARDS.md` lists the VOODO
replacement for each Material UI component.

## TypeScript

Keep new code strictly typed. No `any`, and no suppressions (`@ts-ignore`,
`@ts-expect-error`, `eslint-disable`) without a comment explaining why it is
necessary.
