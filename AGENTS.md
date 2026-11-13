# AGENTS.md

Instructions for AI coding agents working in this repository. FiftyOne is a
Python core (`fiftyone/`) plus a React App (`app/`).

- Any change under `fiftyone/`: see `STYLE_GUIDE.md`.
- Any change under `app/`: **read `app/AGENTS.md` first**, and treat
  `app/CODING_STANDARDS.md` as binding. New App UI uses VOODO
  (`@voxel51/voodo`); do not add Material UI.
- Any change under `e2e-pw/`, or an `e2e:` event in the App: **read
  `e2e-pw/CODING_STANDARDS.md` first** and treat it as binding. CI's
  `e2e-events` job enforces its rules.
