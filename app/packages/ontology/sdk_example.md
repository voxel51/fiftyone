# Ontology SDK Example (Proposed API)

Ontologies are **top-level database resources**: they live in the FiftyOne
database alongside dataset metadata, not attached to any single dataset.
Multiple datasets can reference the same ontology (e.g. for annotation field
schemas).

---

## Proposed top-level API

| Method                                                    | Description                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fo.create_ontology(ontology, overwrite=False)`           | Create (or replace) an ontology in the database. Accepts an `Ontology` instance or a dict.                                                                                                                                                                          |
| `fo.create_ontology_from_json(json_obj, overwrite=False)` | Create (or replace) an ontology from a JSON representation. `json_obj` may be a dict or a JSON string. Returns the created `Ontology`. Equivalent to `fo.create_ontology(Ontology.from_json(json_obj), overwrite=overwrite)`.                                       |
| `fo.list_ontologies(glob_patt=None)`                      | List ontology IDs (names) in the database.                                                                                                                                                                                                                          |
| `fo.list_ontology_versions(ontology_id)`                  | List all `(id, version)` pairs for the given ontology ID.                                                                                                                                                                                                           |
| `fo.load_ontology(ontology_id, version=None)`             | Load an ontology by ID and optional version. Returns an `Ontology` instance. When `version` is None, loads the **latest** version (e.g. by creation time or version sort). If only one version exists, that document is returned. If the ID does not exist, raises. |
| `fo.ontology_exists(ontology_id, version=None)`           | Check if an ontology exists (any version if `version` is None).                                                                                                                                                                                                     |
| `fo.delete_ontology(ontology_id, version=None)`           | Delete an ontology (specific version, or all versions for that ID if `version` is None).                                                                                                                                                                            |

Storage is in the same MongoDB database as FiftyOne (e.g. the default
`fiftyone` db), in a dedicated collection such as `ontologies`, keyed by
`**(id, version)`. The same logical ontology can have multiple documents (e.g.
`animal_classes` at `1.0` and `1.1`). The `version` field is required.

---

## Ontology and Node classes

The SDK exposes two Python classes for building and working with ontologies:

-   `**Ontology`\*\* — Top-level ontology document. Fields: `id`, `version`,
    `description`, `root` (a `Node`).
-   `**Node**` — A single node in the hierarchy. Other fields: `type`,
    `component`, `values` (list of child `Node`s), plus optional `can_select`,
    `read_only`, `default`, `range`, `precision`, `description` (optional;
    gives the user context on this node, e.g. tooltip or guidance), `ontology`.
    For `type` and `component`, use the constants from
    `fiftyone.core.annotation.constants` (e.g. `DROPDOWN`, `STR`, `RADIO`,
    `TEXT`) so you get a single source of truth shared with label schemas.

Both classes live in `fiftyone.core.annotation.ontology`. They can be
serialized to/from the same document structure used in storage (e.g.
`ontology.to_dict()`, `Ontology.from_dict(d)`).
`**Ontology.from_json(json_obj)**` accepts any JSON representation of an
ontology: either a Python dict or a JSON string. It returns an `Ontology`
instance, so you can build from API responses, files, or ad-hoc structures
without constructing `Node`/`Ontology` by hand. `fo.create_ontology()` accepts
an `Ontology` instance or a dict; `fo.create_ontology_from_json()` accepts a
dict or JSON string and persists the ontology. `fo.load_ontology()` returns an
`Ontology` instance.

---

## Example: minimal ontology (flat list of classes)

Build the ontology using `Ontology` and `Node` instead of raw dicts. The root
is a single dropdown of selectable values.

```python
import fiftyone as fo
from fiftyone.core.annotation.constants import DROPDOWN, STR
from fiftyone.core.annotation.ontology import Node, Ontology

root = Node(
    "label",
    type=STR,
    component=DROPDOWN,
    values=[
        Node("dog"),
        Node("cat"),
        Node("bird"),
    ],
)

classes_ontology = Ontology(
    id="animal_classes",
    version="1.0",
    description="Flat set of animal class names",
    root=root,
)


fo.create_ontology(classes_ontology)
fo.list_ontologies()
doc = fo.load_ontology("animal_classes")
```

**Document output (e.g. `classes_ontology.to_dict()` or stored in the
database):**

```python
{
    "id": "animal_classes",
    "version": "1.0",
    "description": "Flat set of animal class names",
    "root": {
        "name": "label",
        "type": "str",
        "component": "dropdown",
        "values": [
            {"name": "dog", "description": "Domestic canine"},
            {"name": "cat", "description": "Domestic feline"},
            {"name": "bird"},
        ],
    },
}
```

---

## Example: create ontology from JSON

You can create an ontology from any JSON object (e.g. from an API, a config
file, or a hand-built dict). Use `**Ontology.from_json()**` to get an
`Ontology` instance, or `**fo.create_ontology_from_json()**` to parse and
persist in one step.

`json_obj` may be:

-   A **dict** — the ontology document (e.g.
    `{"id": "...", "version": "...", "root": {...}}`).
-   A **JSON string** — the same structure as a string; it will be parsed and
    validated.

```python
import fiftyone as fo
from fiftyone.core.annotation.ontology import Ontology

# From a dict (e.g. from another API or config)
ontology_dict = {
    "id": "animal_classes",
    "version": "1.0",
    "description": "Flat set of animal class names",
    "root": {
        "name": "label",
        "type": "str",
        "component": "dropdown",
        "values": [
            {"name": "dog", "description": "Domestic canine"},
            {"name": "cat", "description": "Domestic feline"},
            {"name": "bird"},
        ],
    },
}

# Option 1: Parse only (returns Ontology instance)
ontology = Ontology.from_json(ontology_dict)
fo.create_ontology(ontology)

# Option 2: Parse and create in one step (returns created Ontology)
ontology = fo.create_ontology_from_json(ontology_dict, overwrite=False)

# From a JSON string (e.g. from a file or HTTP response)
json_str = '{"id": "my_ontology", "version": "1.0", "root": {"name": "label", "type": "str", "component": "dropdown", "values": [{"name": "A"}, {"name": "B"}]}}'
ontology = fo.create_ontology_from_json(json_str)
```
