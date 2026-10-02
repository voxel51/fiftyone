# AGENTS.md

Instructions for AI coding agents working in this repository. FiftyOne is a
Python core (`fiftyone/`) plus a React App (`app/`).

- Any change under `fiftyone/`: see `STYLE_GUIDE.md`.
- Any change under `app/`: **read `app/AGENTS.md` first**, and treat
  `app/CODING_STANDARDS.md` as binding. New App UI uses VOODO
  (`@voxel51/voodo`); do not add Material UI.
- Any change under `e2e-pw/`, or an `e2e:` event in the App: **read
  `e2e-pw/WAITS.md` first**. CI's `e2e-waits` job enforces it.
