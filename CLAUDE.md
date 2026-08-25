# CLAUDE.md

Instructions for AI coding agents working in this repository. Coding standards
for the App live in `app/CODING_STANDARDS.md` and are imported below. Treat
them as binding.

@app/CODING_STANDARDS.md

## Design system

App UI is built with VOODO (`@voxel51/voodo`), Voxel51's component library.
Reach for VOODO first, always.

Much of this codebase predates VOODO and is written in Material UI, so **the
surrounding code is not a reliable guide**. Matching the local idiom will
produce MUI, which is what we are migrating away from. New `@mui/*` imports are
frozen by an ESLint rule against a shrinking allowlist; do not add files to
that allowlist to work around it, and do not dodge the rule by importing the
same primitives from sibling packages (`@mui/system`, `@mui/base`, `@mui/lab`).

Before concluding that a component has no VOODO equivalent, check the installed
package's exports rather than guessing. From the repository root:

    grep "export \* from" app/node_modules/@voxel51/voodo/dist/components/index.d.ts

(The App's dependencies are installed under `app/`, not the repository root.)
This is authoritative for the version actually installed, which is what matters
— VOODO's component set changes between releases.

Styling uses VOODO's exported tokens and enums, not raw CSS variables and not
string literals:

    import { Text, TextVariant, TextColor, Icon, IconName, Size } from "@voxel51/voodo";

    <Text variant={TextVariant.Md} color={TextColor.Fg}>{label}</Text>
    <Icon name={IconName.CaretDown} size={Size.Sm} color={TextColor.Secondary} />

Do not hardcode `var(--...)` strings for VOODO tokens.

If you genuinely need a component VOODO does not have, use MUI, and say so in
the PR description along with which gap you hit. Never substitute MUI silently.

## TypeScript

Keep new code strictly typed. No `any`, and no suppressions (`@ts-ignore`,
`@ts-expect-error`, `eslint-disable`) without a comment explaining why it is
necessary.
