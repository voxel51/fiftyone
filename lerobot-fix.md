# LeRobot prerequisite fix plan

This document is the remediation contract for the LeRobot v3 prerequisite
implementation currently ending at commit `456381684f`. It incorporates the
verified Claude and CodeRabbit review findings, the official LeRobot 0.6.1
reader probe, and the latest product clarifications.

The scope remains delivery steps 1-5 only. Do not implement or register the
LeRobot adapter/viewer, client-side LeRobot decoding, curation, remote Hub
browsing, grouped LeRobot support, or P1 generalization while completing this
plan.

## Product decisions

### Import dispatches by source format

Import must dispatch by **source format**, not `MediaReference.kind`, because
the reference does not exist yet.

- Dataset type selection or source-format detection selects the importer.
- For this scope, the LeRobot v3 source format selects
  `LeRobotDatasetImporter`.
- The importer validates the source format and version before constructing any
  `MediaReference` values or inserting samples.
- `MediaReference.kind` remains appropriate for operations performed after a
  reference exists, including hydration, resolution, export planning, server
  manifest generation, and renderer matching.
- Importer registries, auto-detection, error messages, and tests must not imply
  that a reference kind can select an importer for an unimported source.

### Datasets are media-source homogeneous

A dataset is either filepath-backed or media-reference-backed. It is never a
mixture of the two.

For a media-reference-backed dataset, every sample uses the same
`MediaReference.kind`. A LeRobot dataset therefore contains only
`lerobot-episode` references. This does not require every generic future
reference dataset to share one `source_identity`; the LeRobot exporter retains
its stricter single-source export rule.

Enforce homogeneity before mutation in every insertion, import, copy, clone,
and merge path. In particular:

- reject adding a reference-backed sample to a filepath-backed dataset;
- reject adding a filepath-backed sample to a reference-backed dataset;
- reject adding a different reference kind to an existing reference dataset;
- validate a whole batch and its destination before inserting any member;
- leave records, indexes, dataset revision, schema, and App config unchanged on
  rejection; and
- replace the current mixed-mode success test with fail-before-mutation tests.

Because mixed datasets are unsupported, do not preserve both `filepath` and
`_media_reference` in App media configuration. A homogeneous reference dataset
may use only `_media_reference`; a filepath dataset keeps the existing filepath
configuration. Remove or narrow mixed-identity branches that only existed to
support filepath/reference mixtures.

## P0 correctness blockers

### 1. Produce an official-reader-compatible LeRobot v3 export

The exporter currently falls back to `meta/episodes/part-000.parquet`. Official
LeRobot 0.6.1 discovers episode metadata only under
`meta/episodes/chunk-*/file-*.parquet`, so the published dataset is invisible
to the official reader.

Required changes:

- write the default episode metadata shard to
  `meta/episodes/chunk-000/file-000.parquet`;
- continue honoring source metadata templates when they are valid for the
  destination format, without relying on a nonstandard `episodes_path` key;
- rewrite `meta/episodes/chunk_index` and `meta/episodes/file_index` in every
  destination episode row, in addition to the existing data and video
  coordinates;
- validate all rewritten half-open row bounds, indices, timestamps, task
  mappings, statistics, totals, and splits;
- validate the staged destination with the official LeRobot v3 reader before
  publication when the optional dependency is available; and
- retain a dependency-independent structural validator, but do not treat
  FiftyOne re-import alone as proof of official compatibility.

Acceptance coverage:

- export at least two noncontiguous episodes from the real multi-shard corpus;
- open the result with official `LeRobotDatasetMetadata` and `LeRobotDataset`;
- select both exported episodes and materialize at least one frame;
- assert destination episode/data/video coordinates and selected frame counts;
- keep unsupported modes and stale/mixed-source preflight atomic; and
- run the official-reader test behind a clear optional-dependency marker.

### 2. Make source bindings available to the App server

`_SOURCE_BINDINGS` is currently a process-local dictionary. The SDK importer
populates it in the importing Python process, while the App server normally
runs elsewhere. A freshly loaded dataset therefore returns
`MissingMediaRootError` for every manifest request.

Required changes:

- introduce an access-controlled server-side binding store keyed by immutable
  `source_identity`;
- persist the bound root and expected source fingerprint outside sample
  envelopes and browser-visible dataset responses;
- allow an authorized relocation/rebind operation to replace only the
  environment-specific root;
- load bindings in fresh SDK and server processes;
- keep any in-memory dictionary only as a bounded cache over the durable
  binding store;
- preserve typed missing, moved, stale, authorization, and malformed-source
  errors; and
- ensure native thin-reference export/import records that a binding is required
  without leaking or pretending to transport the local root.

Acceptance coverage:

- import in one process and resolve a manifest in a fresh process;
- resolve through the real App route rather than manually rebinding in the test
  process;
- relocate the root through the authorized binding API and resolve again;
- verify that no browser payload or native thin-reference artifact contains the
  absolute root; and
- verify fingerprint mismatch and missing binding remain distinct errors.

### 3. Keep empty reference datasets loadable

The revision compatibility bypass currently requires both revision `2.0.0` and
at least one stored `_media_reference`. After clearing the last sample, a fresh
client tries to migrate from `2.0.0` to the installed `1.x` package and the
dataset can no longer be opened normally.

Required changes:

- make the revision marker sufficient to identify a media-reference-capable
  dataset, including an empty dataset; or adopt an equivalent durable dataset
  capability marker;
- preserve old-client failure for every revision-2 dataset, including empty
  ones; and
- cover clear, delete-last-sample, empty clone, reload, and deletion from a
  fresh process.

### 4. Make duplicate-key rejection atomic

An ordered `insert_many()` can insert earlier documents before a later
duplicate `_media_reference.key` fails. Earlier batches can likewise remain
after a later batch fails.

Required changes:

- validate duplicate reference keys within the complete incoming operation;
- preflight keys against the destination unique index before the first write,
  or provide a transaction/rollback with equivalent semantics;
- preserve normal new Mongo `_id` allocation only after preflight succeeds;
- handle generators and configured batching without leaving earlier batches;
  and
- apply the same guarantee to direct dataset insertion, cross-dataset add,
  native import, clone, and merge paths where duplicate logical identities can
  be introduced.

Acceptance coverage must include a batch ordered as `[new, duplicate]`, a
duplicate in a later batch, duplicates within the incoming batch, and a clean
assertion that document count, indexes, revision, and App config did not
change.

### 5. Complete revision, schema, and index adoption

The current capability marker is applied after insertion and assumes the
dataset was created by new code. Legacy collections and nonempty native-import
destinations can contain references without the required revision or unique
index.

Required changes:

- apply/validate the media-reference dataset revision before the first
  reference write, after all atomic preflight checks pass;
- create or validate the sparse unique `_media_reference.key` index when a
  filepath-empty dataset is converted to reference-backed storage;
- ensure the private base field is represented in any schema metadata needed by
  legacy datasets;
- update nonempty native-import destinations to the media-reference revision
  before reference documents become visible;
- ensure a failed index build, import, or process interruption cannot leave
  reference documents under a pre-media-reference dataset revision;
- reject conversion when existing filepath documents make the dataset
  ineligible under the homogeneous-dataset rule; and
- fix the undefined `MEDIA_REFERENCE_DATASET_REVISION` name in the invalid
  native-import error path so it raises the intended typed compatibility error.

Acceptance coverage:

- simulate a legacy dataset without the reference index, then convert it;
- prove duplicate enforcement after conversion;
- import a native reference dataset into an eligible nonempty destination and
  verify the revision/index before documents are exposed;
- reject an invalid native revision atomically with `MediaReferenceError`, not
  `NameError`; and
- show that an old client fails cleanly for all resulting datasets.

### 6. Enforce source-format-first importer routing

Audit the import entrypoints after adopting the product decision above.

Required changes:

- keep `LeRobotDataset` as the source dataset type that selects
  `LeRobotDatasetImporter`;
- if auto-detection is added, key it on source layout/format evidence such as
  validated v3 metadata, never a future reference kind;
- keep kind-based registries limited to post-construction serialization,
  hydration, resolution, export, and renderer operations;
- report unsupported source formats/versions before constructing samples or
  creating destination state; and
- add a test demonstrating that importer selection happens before
  `LeRobotEpisode` construction.

## P0 operational fixes

### 7. Avoid re-hashing every source asset for every byte-range request

Manifest resolution currently hashes the selected data shard, metadata,
tasks/statistics, and every video shard. The byte route repeats full manifest
resolution for each range request, making seeks proportional to total source
bytes rather than requested bytes.

Required changes:

- add bounded validation/manifest caching with logical cache identity rooted in
  reference key plus source fingerprint;
- deduplicate shared-resource validation by source fingerprint plus canonical
  dataset-relative location;
- include the canonical selector in selected/slice cache keys;
- cache promises or in-flight work where concurrent requests would otherwise
  duplicate validation;
- never use absolute paths, inodes, `resolve_filepath()`, or transient URLs as
  cache identity;
- preserve strong fingerprint validation when source evidence changes; and
- invalidate caches after rebinding, relocation, size/mtime change, or source
  fingerprint change.

Do not weaken content validation by trusting size/mtime alone. They may be used
as fast invalidation evidence around a fingerprint-backed cache.

Acceptance coverage should show that repeated range requests do not re-read a
whole unchanged video shard, while a changed shard still raises a typed stale
reference error.

### 8. Harden the range-serving race and async filesystem work

The byte route performs synchronous `os.stat()` after resolution. An asset
removed or made unreadable in the interval can escape the typed resolver error
mapping and become a 500.

Required changes:

- move blocking filesystem stat/open work off the event loop where needed;
- map `FileNotFoundError`, `NotADirectoryError`, and `PermissionError` to the
  established typed public missing/authorization response;
- preserve authentication and sample/asset scoping across the retry/race; and
- test deletion and permission changes between manifest resolution and byte
  response creation.

### 9. Bound persistence validation work

Reference-aware save/view validation currently scans projected output in
Python. Replace whole-collection validation with a bounded aggregation that
finds at most one invalid XOR/kind document while preserving the same failure
semantics. This optimization must follow, rather than relax, homogeneous
dataset enforcement.

### 10. Deduplicate client manifest fetches

The manifest-backed `EpisodeSource` caches a resolved value but not its
in-flight promise. Concurrent `list()` and `resolve()` calls before the first
request completes can issue duplicate manifest fetches.

Cache the in-flight request, clear it on failure as appropriate, and add a
concurrency test proving one request is issued.

## Behavioral regression cleanup

### 11. Scope atomic `from_dir()` cleanup

The current broad `Dataset.from_dir()` exception handler deletes a newly
created dataset after any importer failure, changing behavior for every dataset
type. Keep LeRobot and native media-reference imports atomic without silently
broadening destructive cleanup for unrelated long-running importers.

Use an explicit importer capability/transaction contract or an equivalently
scoped mechanism, and test both opted-in atomic importers and legacy importer
behavior.

### 12. Align unsupported export-mode errors with the contract

LeRobot export supports only `export_media=True`. Ensure `False`, `"move"`,
`"symlink"`, and `"manifest"` each produce the contractually required typed,
actionable error before destination creation. If one shared exception class is
retained, document that decision and expose a stable per-mode reason/code so
callers can distinguish the cases without parsing prose.

### 13. Settle the serializer version before release

The first unshipped media-reference envelope currently starts at version `"2"`.
Either start the public persistence format at `"1"` or document the
reserved/abandoned version-1 history and add compatibility tests. Do not ship
an unexplained initial version that implies an unsupported predecessor.

## Required regression matrix

In addition to existing tests, the completed fix must cover:

- official-reader export round trip and destination coordinates;
- import selection by source format before reference construction;
- filepath/reference and cross-kind homogeneity rejection before mutation;
- fresh-process source binding and authorized relocation;
- empty revision-2 dataset reload and deletion;
- duplicate rejection across one batch and multiple batches;
- legacy index/schema/revision adoption;
- nonempty native import revision adoption;
- invalid native revision typed error;
- cached manifest/range resolution with stale invalidation;
- range-serving filesystem races;
- concurrent client manifest consumers issuing one request; and
- atomic-import cleanup scoped to participating importer types.

Retain the existing filepath-only regression suites, server redaction tests,
App renderer-host tests, MCAP exclusion tests, and the focused
media-reference/LeRobot suites. Finish with the broadest practical SDK, server,
and App suites, and rerun the real corpus probe with no more than ten episodes.

## Definition of done

The fixes are complete only when all of the following are true:

1. The official LeRobot reader opens and selects an atomically published
   FiftyOne LeRobot export.
2. A freshly started App server resolves imported samples without an in-process
   manual binding call.
3. Reference datasets remain loadable when empty and remain protected from old
   clients.
4. Every incompatible identity/kind or duplicate operation fails before any
   database, index, revision, schema, config, or destination mutation.
5. Import routing is source-format-first; kind dispatch begins only after a
   reference exists.
6. A dataset is demonstrably homogeneous: filepath-backed, or one
   media-reference kind.
7. Range requests are authenticated, typed on races, and do not repeatedly hash
   unchanged shared shards.
8. No private root, binding, locator, canonical path, or source detail reaches
   the browser.
9. No LeRobot adapter/viewer or P1 work has been added.
