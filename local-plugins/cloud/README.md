# @voxel51/cloud

The OSS → FiftyOne Cloud conversion path: pair a machine with the cloud via
device authorization, then push a local dataset (or the current view) through
the onboarding session contract — direct-to-store media upload under a
prefix-scoped credential, batched idempotent metadata ingest, and a
manifest-reconciled close.

Everything cloud-facing lives in the plugin-local `engine/` package, which
imports no fiftyone code — samples enter duck-typed — so it can be lifted
verbatim into a standalone `fiftyone-cloud-cli` package once that exists. The
App shell (a hybrid panel: `panel.py` + `operators.py` + `js/`) and the CLI
(`cli.py`) are thin shells over the same two flows.

## Use

As a plugin (point `FIFTYONE_PLUGINS_DIR` at `local-plugins/`):

Open the **FiftyOne Cloud** panel from the grid's secondary actions. It runs
the whole flow:

1. **Connect** — starts a device pairing. The panel shows the user code and
   opens the approval page; the browser polls until it is approved. Credentials
   land at `~/.fiftyone/cloud.json` (override with `FIFTYONE_CLOUD_CONFIG`).
   **Disconnect** drops the key but keeps the URLs, so reconnecting is one
   click.
2. **Upload** — choose the current view or the whole dataset and a cloud
   dataset name. The panel previews what will move and, when there is something
   to decide (missing media, a resumable upload, a large job), asks before
   starting.
3. **Progress** — the bar is live while the panel is open and durable when it
   is not: the upload runs on a background thread that writes the `cloud_push`
   execution store, so closing the panel, reloading, or opening a second tab
   all pick the same upload back up. Re-running resumes — already-uploaded
   media is skipped via the local state file (`~/.fiftyone/cloud-push/`), and
   metadata batches upsert server-side.

There is no cancel: aborting the operator would close the stream without
stopping the upload thread.

As a CLI (no App needed):

```sh
cd local-plugins/cloud
python cli.py login --api-url https://api.<cloud> --auth-url https://auth.<cloud>/cas/api
python cli.py push quickstart
```

`--auth-url` is the CAS API base and includes its path prefix — the same
convention as the server-side `CAS_BASE_URL`.

## Scope (vertical slice)

- `fiftyone-native` format only; media uploads are single-shot PUTs (no
  multipart) and image-first — video frame documents are not exported yet.
- GCS is the only store provider; a session with no vended credential (dev
  deployments without a media bucket) pushes metadata only.
- Renewal is wired for mid-push credential expiry, single-flight across upload
  workers.

## Tests

```sh
cd local-plugins/cloud
<fiftyone venv>/bin/python -m pytest tests/ -q
cd js && yarn test
```

The Python tests run against fake HTTP sessions, a fake execution store and a
temp profile dir; no network, no database, no App. The vitest suite covers the
hook state machines against injected fakes for the panel-event trigger, the
operator executor and the event source.

## Building the frontend

```sh
cd local-plugins/cloud/js
yarn install
FIFTYONE_DIR=<fiftyone repo root> yarn build
```

`FIFTYONE_DIR` is mandatory — `@voxel51/fiftyone-js-plugin-build`'s
`defineConfig` throws without it, because its private-package resolver needs
the repo root to find the `@fiftyone/*` sources. The `build` script defaults it
to `../../..`, which is correct when the plugin sits in the repo's own
`local-plugins/`; export it explicitly anywhere else.

The `@fiftyone/*` dependencies use yarn's `link:` protocol rather than
`portal:`. The app monorepo declares its own dependencies through yarn catalogs
(`catalog:`), which cannot resolve from a workspace outside it, and `portal:`
would try to. `link:` symlinks the sources without installing their
dependencies — which is all the plugin needs, since every one of them is
externalized. `tsc` is likewise pointed at `src/shims/fiftyone.d.ts` instead of
those sources, which do not type-check standalone.

The bundle externalizes `@fiftyone/*`, react, react-dom, `@mui/material`,
`recoil` and `styled-components`, and **bundles** `@voxel51/voodo`, which the
App does not expose to plugins. voodo themes through prebuilt classes over the
app's globally imported `theme.css` rather than a React context, so the
duplicate module instance still picks up the active theme.
