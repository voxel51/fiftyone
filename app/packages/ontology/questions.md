# Questions

Summary of open questions for the ontology design. Each item has a short title
(links to section) and a one-line question.

-   [Ontology versioning](#ontology-versioning) — Strict auto-increment,
    semantic versioning, or fully user-defined?
-   [Hierarchy → flat conversion](#hierarchy--flat-conversion) — How do we
    convert hierarchical ontologies to flat label schema?
-   [Ontology naming](#ontology-naming) — Reserved names vs user choice?
-   [can_select](#can_select) — Do we need it?
-   [Referenced ontology integrity](#referenced-ontology-integrity) — How do we
    protect or handle deleted/missing references?
-   [Recursive depth and cycles](#recursive-depth-and-cycles) — How do we bound
    resolution and prevent cycles?
-   [Frontend: which ontology is being edited](#frontend-which-ontology-is-being-edited)
    — When the user edits a large JSON blob, how do we know which ontology they
    are referencing so we can pass the edit to the backend correctly?
-   [Editing: versioning and validation](#editing-versioning-and-validation) —
    Version bump rules, permissions, and invalid-edit behavior?
-   [Validation requirement](#validation-requirement) — Must all create/edit
    flows validate before persist?
-   [Flat values vs path-as-value](#flat-values-vs-path-as-value) — Store node
    name only or full path?
-   [Conversion vs direct citation](#conversion-vs-direct-citation) — Convert
    to flat schema at resolution, or cite ontology directly?
-   [Duplicate keys in hierarchy](#duplicate-keys-in-hierarchy) — Are duplicate
    node names allowed; how do we disambiguate?
-   [Ontology reference on detection](#ontology-reference-on-detection) — Do we
    persist ontology id on detections/fields?
-   [Reuse label schema validation](#reuse-label-schema-validation) — Should
    ontology validation reuse existing label schema validators?

---

## Hierarchy → flat conversion

**How do we convert hierarchical ontologies to flat label schema?**

Keep **ontologies hierarchical** (source of truth) and **label schema flat**
(consumer format). Convert **hierarchy → flat** at resolution; do not add
hierarchy to label schema. **(1) Attributes:** Walk the tree; for each node
with `name` + `type` + `component`, emit one flat `attributes` entry; derive
`values` from children’s `name`s and `when` from the path of parent (option)
nodes. **(2) Classes:** Flatten selectable descendants to a single `classes`
list and set `classes_taxonomy` so the App can render a tree (e.g. TreeSelect).

---

## Ontology naming

**Reserved names vs user choice?**

Prefer **user-chosen names** with minimal technical rules. **(1) Uniqueness:**
Ontology `id` must be unique so references resolve. **(2) Technical
constraints:** Document character set / max length / slug pattern as needed for
storage and URLs. **(3) Reserved names:** Avoid a reserved list unless we ship
built-in ontologies or need a system namespace; if so, reserve a small prefix
(e.g. `fo_`_, `fiftyone._`) and document it. No strong opinion on style
(snake_case, kebab-case, etc.).

---

## `can_select`

**Do we need `can_select`?**

No label-schema equivalent; it distinguishes selectable nodes from group-only
nodes. If we drop it, treat all nodes as selectable. Decide whether to keep or
remove.

---

## Referenced ontology integrity

**How do we ensure referenced ontologies are not deleted while in use, and what
happens if one is missing?**

Options: refuse delete when referenced; soft-delete and keep referenced ones;
or allow delete and define missing-reference behavior. If a referenced ontology
is deleted or missing: resolver can error, treat the node as empty, or fall
back to the node’s own `children` if present. Decide and document the chosen
behavior.

---

## Recursive depth and cycles

**How do we bound resolution and prevent cycles?**

Reference chains can be arbitrarily deep; cycles are possible (A→B→C→A).
Validation must detect cycles and either reject the ontology or define a max
resolution depth and document behavior at the cap.

### Frontend: which ontology is being edited

**When the user edits a large JSON blob, how do we know which ontology they are
referencing so we can pass the edit to the backend correctly?**

The backend uses recursion and ontologies can refer to each other. On the
frontend, the user may edit a single large JSON blob (e.g. one resolved or
composed view). We need to distinguish **(1)** the user’s own edit (which
ontology or node they intend to change) from **(2)** the frontend correctly
passing that edit to the backend. That requires logic to determine **which
ontology the user is actually referencing** (e.g. by selection context, cursor
position, or explicit scope) so the frontend can route the edit to the right
ontology and avoid misattributing changes or overwriting the wrong resource.
Decide how to derive or expose that scope (e.g. current ontology id, path in
the tree, or “root” of the blob) and how the backend accepts scoped patches.

---

## Editing: versioning and validation

**When an ontology is edited: version rules, permissions, and invalid-edit
behavior?**

-   **Version update:** Require bump before save, or auto-increment / monotonic
    increase?
-   **Permissions:** Who can edit or bump (e.g. dataset write access vs
    separate permission)?
-   **Invalid edits** (broken refs, cycles, missing keys, invalid components):
    Reject save with validation errors; allow save but mark invalid and hide
    from UI; or allow save and surface errors at resolution time?
-   **Intelligent reference** - how can we intelligently resolve the "latest"
    version?

Define validation rules and UX for failed edits.

---

## Ontology versioning

**Should we use strict auto-incrementing versioning, enforce semantic
versioning, or leave versioning fully up to the user?**

-   **(1) Strict auto-increment:** System assigns a monotonic version (e.g.
    integer or timestamp) on every save; user cannot set or override. Pros:
    simple, no conflicts, easy to compare and cache. Cons: no way to signal
    breaking vs non-breaking changes; less expressive for release notes or API
    contracts.
-   **(2) Semantic versioning (e.g. MAJOR.MINOR.PATCH):** Require or encourage
    semver; MAJOR = breaking (e.g. removed/renamed classes), MINOR = additive,
    PATCH = fixes/docs. Pros: clear meaning, good for downstream consumers and
    compatibility checks. Cons: users must understand and apply semver
    correctly; validation/automation (e.g. auto-bump MINOR on non-breaking
    edit) adds complexity.
-   **(3) User-defined / open:** Version is an optional, opaque string or
    number entirely under user control. Pros: maximum flexibility; no product
    opinion. Cons: no guaranteed ordering or meaning; harder to reason about
    compatibility or caching.

Decide whether to enforce a scheme, recommend one (e.g. semver) with optional
strictness, or keep versioning fully open. See also
[Editing: versioning and validation](#editing-versioning-and-validation) for
how version bumps interact with save and permissions.

---

## Validation requirement

**Must every ontology (new or updated) be validated before persist?**

Ensure every create/edit validates against the defined schema (required keys,
allowed components, no cycles, valid references, etc.) before accept or
persist.

---

## Flat values vs path-as-value

**When converting to label schema: store node name only or full path?**

-   **(1) Flat values list:** Collect selectable nodes’ `name`s into one list;
    stored value = node `name`. Pros: simple, fits current schema. Cons: for
    classes/taxonomies you lose path (e.g. "Pembroke" under corgi vs under
    retriever); need ontology to interpret.
-   **(2) Path as value:** Stored value = full path (e.g. `"corgi.Pembroke"` or
    `["dog","corgi","Pembroke"]`). Pros: unambiguous, self-describing. Cons:
    schema/backend must support path-shaped values; validation and flat
    consumers may need changes or dual support.

Decide: keep flat list + node name only, or introduce path-based values, and
how that interacts with validation and round-trip.

---

## Conversion vs direct citation

**Convert ontology to flat label schema at resolution, or have field config
cite the ontology directly?**

-   **(1) Conversion:** Resolve to flat `attributes`/`classes`/`when`;
    App/backend consume flat schema. Pros: one consumer format, backward
    compatible. Cons: two representations; conversion logic and edge cases.
-   **(2) Direct cite:** Field config stores ref (e.g.
    `ontology: "vehicle_attrs"`); App/backend load ontology for
    rendering/validation. Pros: single source of truth; edits reflect
    everywhere. Cons: App/backend must be ontology-aware; extend label schema
    or add distinct path for ontology-driven fields.

**Recommendation (for discussion):** Hybrid—keep conversion for **backend**
(validation, patches) so Python has one format; let the **App** optionally
accept either pre-converted schema or an ontology ref and resolve/display from
ontology when present (e.g. TreeSelect). Backend stays format-agnostic; UI can
cite ontology for richer rendering.

---

## Duplicate keys in hierarchy

**Can the same `name` appear more than once (e.g. under different parents or as
siblings)? How do we disambiguate?**

If allowed: identify nodes by path from root or require unique names per
subtree? If disallowed: uniqueness among siblings only, or globally? Define
validity, how resolution and flat conversion disambiguate, and validation
rules.

---

## Ontology reference on detection

**Do we persist ontology (or ontology id) on the detection or field?**

Without it we only have flat values and infer context from the field’s label
schema; with it the App/backend can resolve the ontology for tree UI,
validation, path-based display. Multiple ontologies can share similar keys, so
storing only the key is insufficient—we need **key + ontology id**. Options:
store ontology id on each detection (or on the field); or derive context from
resolved schema only (insufficient if keys collide across ontologies). Decide
whether and where to persist the reference.

---

## Reuse label schema validation

**Should ontology validation reuse existing label schema validation code?**

Goals: (1) allowed types/components in one place; (2) ontology-valid ⇒
converted flat schema passes label schema validation; (3) no duplicated rules.
Options: **(1) Reuse:** Ontology validation calls same validators/helpers;
after conversion, run existing label schema validator on flat output. **(2)
Duplicate:** Ontology has its own validation mirroring the rules. **(3)
Layered:** Shared layer (“valid type”, “valid component”) used by both;
ontology adds hierarchy-specific checks on top. Decide how much to share and
where the shared code lives.
