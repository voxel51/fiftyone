# Ontology Structure Proposal

This document proposes a concrete structure for ontologies in FiftyOne. Every
ontology is a **single hierarchy of nodes and edges**. Value-dependent behavior
(e.g. “show attribute B only when attribute A = X”) is not a separate
concept—it is expressed as **edges** in that hierarchy (each child node has a
`name`). Every ontology can be **converted into the existing label schema
format** used by the App and Python today.

The target label schema shape is unchanged for flat use cases; we extend it
only where needed to support ontology-derived data (e.g. optional `when` on
attributes—derived during conversion from the hierarchy—and optional `ontology`
reference).

---

## Design principles

1. **One hierarchy, one node shape; all ontologies specify components** — Every
   ontology has a **root node** (and any node that defines a UI control) with
   `**name`, `type`, and `component`** so the UI knows how to render it. **Any
   node that has `values` must have a `component`** chosen to render those
   values (e.g. nodes with `type`/`component` use `dropdown`, `radio`, etc. for
   their list of child nodes; nodes with `values` use a label-schema component
   such as `dropdown` to render the value list). All `component` values must be
   from the label schema set: `checkbox`, `checkboxes`, `datepicker`,
   `dropdown`, `json`, `radio`, `slider`, `text`, `toggle` (see
   [label_schemas.md](./label_schemas.md) and
   `fiftyone.core.annotation.constants`). There is no separate “conditional
   attributes” concept and no separate `values` key. Nodes with `type` and
   `component` have **child nodes\*\* in `values` (each with `name`, optional
   `can_select`, optional `values`). “Conditional” behavior is the edge
   structure: under a given option you see that node’s children.
2. **Ontology as source of truth** — The ontology document defines the full
   hierarchy. Conversion produces a label schema the App and backend already
   understand.
3. **Round-trip friendly** — A flat label schema (no ontology) remains valid.
   When an ontology is attached, the derived label schema is a superset: same
   fields, plus optional visibility and taxonomy references.
4. **Recursive / composable** — Ontologies can reference other ontologies by
   name (`ontology` on a node). At resolution time referenced root nodes are
   inlined so the App can render one merged hierarchy; cycles must be detected
   and rejected or capped.

---

## Ontology document (top level)

An ontology is a named, versioned document with a single **root** node. The
**root must have `name`, `type`, and `component`** so every ontology specifies
a UI component. The tree uses one node shape; nodes with `type`/`component`
have child nodes in `values` (`name`, optional `can_select`, `values`).

| Field         | Type   | Description                                                            |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `id`          | string | Unique identifier (e.g. `"vehicle_attributes"`, `"imagenet_animals"`). |
| `version`     | string | Optional version for governance (e.g. `"1.0"`).                        |
| `description` | string | Optional human-readable description.                                   |
| `root`        | object | Root node of the hierarchy (single node; edges go to child nodes).     |

---

## Node shape (one type)

There is a **single node type**. **Every node has a `name`**—the label for this
node (what to display or the schema key). Any node may have an optional
**`description`** to give the user context (e.g. tooltip or guidance). The role
of the node is determined by what else it has:

-   **Has `name` and `type` and `component`** — The `name` is the label
    attribute name (e.g. `vehicle_type`, `make`). The node’s `**values**` are
    the options for this field (each value has its own `name`, e.g. `car`,
    `Honda`). A node with no outgoing edges has no `values`; a node with
    outgoing edges has `values` (the next level).
-   **Has `name` only** (no `type`/`component`) — The `name` is the selectable
    or group label (e.g. `car`, `dog`, `Civic`). Optional `values` are the
    child nodes (next level). **If a node has `values`, it must also have a
    `component`** from the label schema (e.g. `dropdown`) so the UI knows how
    to render the value list; a node with no `values` needs no component.

So there is no separate single-`value` key—every node uses `**name**` for its
label. Nodes with `type` and `component` are distinguished by having those
fields. **Child nodes are the `values` array** (each with a `name`); a node
with no children has no `values`; a node with children has `values`. There is
no `when` key—the hierarchy of nodes and edges encodes the structure.

| Field         | Type             | Description                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string           | **Required.** The label for this node. E.g. attribute name as schema key, or selectable label such as "car", "Civic", "dog".                                                                                                                                                                                                                  |
| `type`        | string           | For nodes that define an attribute. Same as label schema: `str`, `int`, `float`, `bool`, `list<str>`, etc.                                                                                                                                                                                                                                    |
| `component`   | string           | **Required when the node has `values`.** Same as label schema (`dropdown`, `radio`, `text`, `slider`, etc.)—defines how to render the control and its list of child nodes. Allowed values: `checkbox`, `checkboxes`, `datepicker`, `dropdown`, `json`, `radio`, `slider`, `text`, `toggle`. Omit only for nodes with no `values`.             |
| `can_select`  | boolean          | For nodes without type/component. **Defaults to `true`.** If `true`, this node can be chosen as a value; if `false`, the node is a group header only (expands to show child nodes but is not itself selectable). Omit when `true`; include only when `false`.                                                                                 |
| `read_only`   | boolean          | For nodes with type/component, optional.                                                                                                                                                                                                                                                                                                      |
| `default`     | any              | For nodes with type/component, optional default when creating a new label.                                                                                                                                                                                                                                                                    |
| `range`       | [number, number] | For nodes with type/component, optional; for `slider` component.                                                                                                                                                                                                                                                                              |
| `precision`   | number           | For nodes with type/component, optional; for float `text` component.                                                                                                                                                                                                                                                                          |
| `description` | string           | Optional. Gives the user context on this node (e.g. tooltip or guidance).                                                                                                                                                                                                                                                                     |
| `ontology`    | string           | Optional. **Reference to another ontology** by name. When present, this node is a placeholder: at resolution time the referenced ontology’s `root` is inlined here (see “Recursive ontologies” below). The node typically has a `name`; `values` are ignored when `ontology` is set, or used as fallback if the reference cannot be resolved. |
| `values`      | array            | Optional. List of child nodes (same shape). Each has a `name`; a node with no children has no `values`; a node with children has `values`. Ignored when `ontology` is set (the referenced ontology’s root supplies the subtree).                                                                                                              |

**Root must specify a component.** The **root node of every ontology** must
have `name`, `type`, and `component` so the UI has a defined control (e.g.
dropdown, radio, text). Child nodes have `name`, optional `can_select`
(defaulting to `**true`**), optional `values`. A node that has
`**values**`must specify a`**component\*\*`from the label schema (e.g.`dropdown`) so the UI knows how to render those child nodes; nodes with no `values`do not need`type`/`component`. Set `can_select:
false` only for group-only nodes that are not selectable (see examples below).

---

## Example: Attribute hierarchy (value-dependent structure)

Vehicle type → make → model: the “make” and “model” attributes appear only when
certain parent nodes are selected. Nodes with `type`/`component` have `name`
plus `type` and `component`; their **child nodes in `values`**, each with a
`name` (e.g. motorcycle has no `values`; car has `values` and a `**component**`
from the label schema (e.g. `dropdown`) to render them, e.g. car → make).

```json
{
    "id": "vehicle_attributes",
    "version": "1.0",
    "description": "Vehicle type, then make and model as value-dependent structure",
    "root": {
        "name": "vehicle_type",
        "type": "str",
        "component": "dropdown",
        "values": [
            {
                "name": "car",
                "component": "dropdown",
                "values": [
                    {
                        "name": "Wheels",
                        "type": "int",
                        "component": "radio",
                        "values": [
                            { "name": "2" },
                            { "name": "4" },
                            { "name": "6" },
                            { "name": "8" }
                        ]
                    },
                    {
                        "name": "make",
                        "type": "str",
                        "component": "dropdown",
                        "values": [
                            {
                                "name": "Honda",
                                "component": "dropdown",
                                "values": [
                                    {
                                        "name": "model",
                                        "type": "str",
                                        "component": "dropdown",
                                        "values": [
                                            { "name": "Civic" },
                                            { "name": "Accord" },
                                            { "name": "CR-V" }
                                        ]
                                    }
                                ]
                            },
                            {
                                "name": "Toyota",
                                "component": "dropdown",
                                "values": [
                                    {
                                        "name": "model",
                                        "type": "str",
                                        "component": "dropdown",
                                        "values": [
                                            { "name": "Camry" },
                                            { "name": "Corolla" },
                                            { "name": "RAV4" }
                                        ]
                                    }
                                ]
                            },
                            {
                                "name": "Ford",
                                "component": "dropdown",
                                "values": [
                                    {
                                        "name": "model",
                                        "type": "str",
                                        "component": "dropdown",
                                        "values": [
                                            { "name": "F-150" },
                                            { "name": "Mustang" },
                                            { "name": "Explorer" }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                "name": "truck",
                "component": "dropdown",
                "values": [
                    {
                        "name": "Wheels",
                        "type": "int",
                        "component": "radio",
                        "values": [
                            { "name": "2" },
                            { "name": "4" },
                            { "name": "6" },
                            { "name": "8" }
                        ]
                    },
                    {
                        "name": "axle_count",
                        "type": "int",
                        "component": "text"
                    }
                ]
            },
            {
                "name": "motorcycle",
                "component": "dropdown",
                "values": [
                    {
                        "name": "Wheels",
                        "type": "int",
                        "component": "radio",
                        "values": [
                            { "name": "2" },
                            { "name": "4" },
                            { "name": "6" },
                            { "name": "8" }
                        ]
                    }
                ]
            },
            {
                "name": "Other",
                "can_select": false,
                "component": "dropdown",
                "values": [
                    {
                        "name": "other_vehicle_type",
                        "type": "str",
                        "component": "text"
                    }
                ]
            }
        ]
    }
}
```

---

## Recursive ontologies: referencing other ontologies

Ontologies can **reference other ontologies** by name. Any node may set
`**ontology`** to the `name` of another ontology (e.g. `"vehicle_attributes"`,
`"imagenet_animals"`). When building the full hierarchy for the App (or for
conversion), the resolver **inlines** the referenced ontology’s `root` in place
of that node, so we end up with a **single, merged tree\*\* for rendering.

### Semantics

-   **Node with `ontology: "other_name"`** — This node is a reference. It
    usually has a `name` (under which the referenced tree appears). Its
    `values` are ignored when resolving; the referenced ontology’s `**root**`
    becomes the subtree at this node.
-   **Resolution** — When loading an ontology for display or conversion,
    recursively resolve: whenever a node has `ontology`, load that ontology by
    name and replace the node’s subtree with the referenced ontology’s `root`.
    Repeat until no node has an unresolved `ontology`. The result is one tree
    with no references (or with references only as metadata for “expandable” UX
    if desired).
-   **Cycles** — If ontology A references B and B references A (or A → B → C →
    A), resolution would not terminate. The implementation must **detect
    cycles** (e.g. track ontology names already in the resolution stack) and
    either **error** or **cap depth** and stop inlining at a maximum depth.
    Recommended: detect cycles and return an error or a truncated tree with a
    warning.
-   **Missing reference** — If `ontology` names an ontology that does not
    exist, the resolver can error, or treat the node as empty (no values), or
    keep the node’s own `values` if present as fallback.

### Example: composite ontology that references two others

An ontology `"full_annotation"` can compose other ontologies under a top-level
node so the UI shows one combined hierarchy. Each referenced ontology (e.g.
`"vehicle_attributes"`, `"animal_classes"`) must have a **root with `name`,
`type`, and `component`** so the UI can render it. For example,
`vehicle_attributes` has a root node with type/component; an `animal_classes`
ontology would have a root such as
`name: "label", type: "str", component: "dropdown"` with `values` as the
taxonomy. Resolved together.

```json
{
    "id": "full_annotation",
    "version": "1.0",
    "description": "Combined vehicle and animal ontologies for annotation",
    "root": {
        "name": "category",
        "type": "str",
        "component": "dropdown",
        "values": [
            {
                "name": "vehicle",
                "ontology": "vehicle_attributes"
            },
            {
                "name": "animal",
                "ontology": "animal_classes"
            }
        ]
    }
}
```

When resolved, the node
`{ "name": "vehicle", "ontology": "vehicle_attributes" }` is replaced by the
full tree whose root is `vehicle_attributes`’s `root` (e.g. the `vehicle_type`
node and its child nodes). Similarly for `animal` and `imagenet_animals`. The
App then renders one hierarchy: category → vehicle (whole vehicle tree) |
animal (whole animal tree).

### Conversion with references

Conversion to label schema (flattening attributes, deriving `when`, flattening
classes) should run **after** resolution. So the pipeline is: (1) load ontology
by name, (2) resolve all `ontology` references (inlining referenced roots, with
cycle detection), (3) convert the resulting single tree to the flat label
schema. The flattened schema does not need to mention the referenced ontology
names; the resolved tree is just one tree.

---

## [WIP] Referencing ontologies from label schemas

A label schema references an ontology:

```json
{
    "ground_truth": {
        "type": "detections",
        "component": "dropdown",
        "ontology": "animal_classes"
    }
}
```

---

## [WIP] Conversion: ontology → label schema

Conversion walks the single tree and produces the flat structures the existing
label schema expects. The ontology never uses a `when` key; structure is
expressed only by nodes and edges (the `values` array). When emitting the flat
label schema for the App/backend, the converter **derives** `when` and `values`
from the ontology.

## [WIP] More complex logical operators

Store when on nodes using the same structure as MongoDB query operators. Then
the condition is “declarative” in the doc and executable by the database.

Example for “show axle_count only when number_of_wheels > 6”:

```
{
  "name": "axle_count",
  "type": "int",
  "component": "dropdown",
  "when": {
    "number_of_wheels": { "$gt": 6 }
  },
  "values": [ { "name": "2" }, { "name": "3" } ]
}
```

---

## Summary

-   **Ontology** = one hierarchy: a document with `id`, `version`,
    `description`, and `root`. There is **one node shape**; **every node has a
    `name`**. **Any node that has `values` must have a `component`** so the UI
    knows how to render those values (form fields: dropdown, radio, etc.; nodes
    with values: e.g. `dropdown`). All components must be from the label schema
    (see [label_schemas.md](./label_schemas.md); Python:
    `fiftyone.core.annotation.constants`). The **root** must have `name`,
    `type`, and `component`. Form fields have `type`/`component`; their
    **options** are the `**values`** array; nodes with values must also specify
    a label-schema `component` (e.g. `dropdown`). The ontology never uses
    `when`; branches are expressed only as values. **Recursive:** any node may
    set
    `**ontology`** to another ontology’s name; at resolution time the referenced ontology’s `root`
    is inlined so we can render a single hierarchy (with cycle detection).
-   **Conversion to label schema:** (1) Flatten all nodes with `name` and
    `type`/`component` to an `attributes` list; **derive** `values` from each
    node’s direct children’s `name`s and **derive** `when` from the path of
    nodes that lead to each (for output only). (2) When a label schema
    references an ontology via `ontology`, the schema stores only the ontology
    name; the backend loads the ontology and derives classes and attributes
    from it for validation and UI. The result stays within the current label
    schema surface with small, backward-compatible extensions.
