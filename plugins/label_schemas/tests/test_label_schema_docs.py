"""Unit tests for ``fiftyone.core.label_schema_docs`` (named schema docs)."""

import pytest

import fiftyone.core.label_schema_docs as docs
from fiftyone.core.label_schema_docs import (
    normalize_visibility,
    resolve,
    synthesize_default,
)

from .memory import DATASET_ID as DS

# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def test_crud_roundtrip():
    doc = docs.create(
        dataset_id=DS,
        name="bbox-pass",
        description="boxes only",
        label_schema={"car": {"type": "detections"}},
        visibility={
            "default": "explore",
            "fields": {"gt": {"tier": "hidden"}},
        },
        created_by="u_test",
    )
    assert doc["id"] and doc["version"] == 1
    assert doc["visibility"] == {
        "default": "explore",
        "fields": {"gt": {"tier": "hidden"}},
    }

    rows = docs.list_(dataset_id=DS)
    assert [r["name"] for r in rows] == ["bbox-pass"]

    fetched = docs.get(doc["id"], dataset_id=DS)
    assert fetched["label_schema"] == {"car": {"type": "detections"}}
    assert "content" not in fetched

    updated = docs.update(
        doc["id"],
        dataset_id=DS,
        visibility={
            "fields": {
                "gt": {"tier": "hidden"},
                "car": {"attributes": {"year": "hidden"}},
            }
        },
    )
    assert updated["version"] == 2
    assert updated["visibility"] == {
        "fields": {
            "gt": {"tier": "hidden"},
            "car": {"attributes": {"year": "hidden"}},
        }
    }

    assert docs.delete(doc["id"], dataset_id=DS) is True
    assert docs.get(doc["id"], dataset_id=DS) is None
    assert docs.delete(doc["id"], dataset_id=DS) is False


def test_duplicate_names_rejected():
    docs.create(dataset_id=DS, name="lens")
    with pytest.raises(ValueError):
        docs.create(dataset_id=DS, name="lens")
    other = docs.create(dataset_id=DS, name="other")
    with pytest.raises(ValueError):
        docs.update(other["id"], dataset_id=DS, name="lens")


def test_create_requires_name():
    with pytest.raises(ValueError):
        docs.create(dataset_id=DS, name="   ")


def test_content_alias_still_writes_label_schema():
    doc = docs.create(
        dataset_id=DS,
        name="legacy-writer",
        content={"car": {"type": "detections"}},
    )
    assert doc["label_schema"] == {"car": {"type": "detections"}}
    updated = docs.update(
        doc["id"], dataset_id=DS, content={"gt": {"type": "detections"}}
    )
    assert updated["label_schema"] == {"gt": {"type": "detections"}}


# ---------------------------------------------------------------------------
# normalize_visibility
# ---------------------------------------------------------------------------


def test_normalize_visibility_structured():
    raw = {
        "default": "explore",
        "fields": {
            "car": {
                "tier": "annotate",
                "attributes": {
                    "year": "hidden",
                    "state": "editable",  # legacy spelling → annotate
                    "kind": "explore",
                    "bad": "nope",
                },
            },
            "gt": {"tier": "hidden"},
            "aux": {"tier": "bogus"},  # dropped entirely (empty entry)
            "": {"tier": "hidden"},  # dropped: empty path
        },
    }
    assert normalize_visibility(raw) == {
        "default": "explore",
        "fields": {
            "car": {
                "tier": "annotate",
                "attributes": {
                    "year": "hidden",
                    "state": "annotate",
                    "kind": "explore",
                },
            },
            "gt": {"tier": "hidden"},
        },
    }
    assert normalize_visibility(None) == {"fields": {}}
    assert normalize_visibility({"default": "annotate"}) == {"fields": {}}


def test_normalize_visibility_converts_legacy_flat_maps():
    raw = {
        "car": "annotate",
        "gt": "hidden",
        "car.year": "hidden",
        "car.state": "editable",
        "frames.det": "explore",  # single frames. prefix = FIELD path
        "*": "explore",
        "bad_field": "nope",
    }
    assert normalize_visibility(raw) == {
        "default": "explore",
        "fields": {
            "car": {
                "tier": "annotate",
                "attributes": {"year": "hidden", "state": "annotate"},
            },
            "gt": {"tier": "hidden"},
            "frames.det": {"tier": "explore"},
        },
    }


def test_normalize_visibility_never_hides_protected_attributes():
    raw = {
        "fields": {
            "car": {
                "attributes": {
                    "id": "hidden",
                    "tags": "hidden",
                    "index": "hidden",
                    "mask_path": "hidden",
                    "year": "hidden",
                }
            }
        }
    }
    assert normalize_visibility(raw)["fields"]["car"]["attributes"] == {
        "id": "annotate",
        "tags": "annotate",
        "index": "annotate",
        "mask_path": "annotate",
        "year": "hidden",
    }


def test_resolve_ignores_hidden_tier_on_protected_attributes():
    doc = {
        "id": "d1",
        "name": "lens",
        "label_schema": {
            "car": {
                "type": "detections",
                "attributes": [
                    {"name": "id", "type": "str"},
                    {"name": "year", "type": "int"},
                ],
            }
        },
        "visibility": {
            "default": "explore",
            "fields": {
                "car": {
                    "tier": "annotate",
                    "attributes": {"id": "hidden", "year": "hidden"},
                }
            },
        },
    }
    out = resolve(doc, ["car"])
    assert out["excluded_attr_paths"] == ["car.year"]
    assert out["excluded_attr_db_paths"] == ["car.detections.year"]
    names = [
        a["name"]
        for a in out["label_schemas"]["car"]["label_schema"]["attributes"]
    ]
    assert names == ["id"]


# ---------------------------------------------------------------------------
# resolve
# ---------------------------------------------------------------------------


def _doc():
    return {
        "id": "d1",
        "name": "lens",
        "label_schema": {
            "car": {
                "type": "detections",
                "classes": ["sedan", "suv"],
                "bbox": "read_only",
                "label": "read_only",
                "attributes": [
                    {"name": "color", "type": "str"},
                    {"name": "year", "type": "int"},
                    {"name": "occluded", "type": "bool", "read_only": True},
                ],
            },
            "aux": {"type": "classifications"},
        },
        "visibility": {
            "default": "hidden",
            "fields": {
                "aux": {"tier": "explore"},  # content present, demoted
                "gt": {"tier": "hidden"},  # hidden without content
                "notes": {"tier": "annotate"},  # no content → explore
                "car": {"attributes": {"year": "hidden", "color": "explore"}},
            },
        },
    }


def test_resolve_tiers_and_masking():
    out = resolve(_doc(), universe=["car", "aux", "gt", "brightness"])

    # Annotate tier: every SCANNED field — aux's legacy explicit
    # "explore" no longer demotes a set-up field (there is no
    # explore-only state for scanned fields); notes has no content and
    # degrades to explore.
    assert sorted(out["active"]) == ["aux", "car"]
    assert set(out["label_schemas"]) == {"aux", "car"}

    car = out["label_schemas"]["car"]
    attrs = car["label_schema"]["attributes"]
    # year hidden + color explore-tier → both lose their inputs;
    # unlisted occluded stays (its content read_only lock intact).
    assert [a["name"] for a in attrs] == ["occluded"]
    assert attrs[0]["read_only"] is True
    # bbox/label knobs stamp the FE's shipped lock keys.
    assert car["bbox_read_only"] is True
    assert car["label_schema"]["label_read_only"] is True

    # Hidden: explicit gt + default-hidden expansion over the universe.
    assert out["excluded_paths"] == ["brightness", "gt"]
    # Hidden ATTRIBUTES of visible fields feed the explore-menu
    # exclusion channel; payload stripping gets the DB path (list key
    # included for list types).
    assert out["excluded_attr_paths"] == ["car.year"]
    assert out["excluded_attr_db_paths"] == ["car.detections.year"]


def test_resolve_defaults_are_permissive():
    out = resolve(
        {
            "id": "d",
            "name": "n",
            "label_schema": {"car": {"type": "detections"}},
        },
        universe=["car", "gt"],
    )
    # Content membership = annotate; default explore = nothing hidden.
    assert out["active"] == ["car"]
    assert out["excluded_paths"] == []


def test_resolve_accepts_legacy_stored_shape():
    legacy = {
        "id": "d1",
        "name": "old",
        "content": {
            "car": {
                "type": "detections",
                "attributes": [
                    {"name": "color", "type": "str"},
                    {"name": "occluded", "type": "bool"},
                ],
            }
        },
        "visibility": {
            "*": "hidden",
            "gt": "hidden",
            "car.color": "explore",
            "car.occluded": "read_only",  # legacy → annotate + lock
        },
    }
    out = resolve(legacy, universe=["car", "gt", "brightness"])
    assert out["active"] == ["car"]
    attrs = out["label_schemas"]["car"]["label_schema"]["attributes"]
    assert [a["name"] for a in attrs] == ["occluded"]
    assert attrs[0]["read_only"] is True
    assert out["excluded_paths"] == ["brightness", "gt"]


def test_get_converts_legacy_stored_docs():
    # Simulate a doc persisted by the earlier prototype.
    docs._coll().insert_one(
        {
            "_id": "legacy1",
            "dataset_id": DS,
            "name": "old-shape",
            "version": 3,
            "content": {"car": {"type": "detections"}},
            "visibility": {"*": "explore", "gt": "hidden"},
        }
    )
    doc = docs.get("legacy1", dataset_id=DS)
    assert doc["label_schema"] == {"car": {"type": "detections"}}
    assert doc["visibility"] == {
        "default": "explore",
        "fields": {"gt": {"tier": "hidden"}},
    }
    assert "content" not in doc


def test_propagate_field_fans_out_across_schemas():
    source = docs.create(dataset_id=DS, name="source")
    other = docs.create(dataset_id=DS, name="other")
    # A schema that already models the field is left alone.
    modeled = docs.create(
        dataset_id=DS,
        name="modeled",
        visibility={"fields": {"new": {"tier": "explore"}}},
    )

    entry = {"type": "detections", "classes": ["a"]}
    updated = docs.propagate_field(
        "new", entry, source_doc_id=source["id"], dataset_id=DS
    )
    assert updated == 2

    src = docs.get(source["id"], dataset_id=DS)
    assert src["label_schema"]["new"] == entry
    assert "new" not in src["visibility"]["fields"]
    assert src["version"] == 2

    oth = docs.get(other["id"], dataset_id=DS)
    assert "new" not in oth["label_schema"]
    assert oth["visibility"]["fields"]["new"] == {"tier": "hidden"}

    unchanged = docs.get(modeled["id"], dataset_id=DS)
    assert unchanged["visibility"]["fields"]["new"] == {"tier": "explore"}
    assert unchanged["version"] == 1

    # No source: every schema hides the field (created in the default).
    docs.propagate_field("newer", None, dataset_id=DS)
    for doc_id in (source["id"], other["id"], modeled["id"]):
        doc = docs.get(doc_id, dataset_id=DS)
        assert doc["visibility"]["fields"]["newer"] == {"tier": "hidden"}

    with pytest.raises(ValueError):
        docs.propagate_field("  ", None, dataset_id=DS)


def test_resolve_never_excludes_protected_fields():
    doc = {
        "id": "d",
        "name": "n",
        "label_schema": {"car": {"type": "detections"}},
        "visibility": {
            "default": "hidden",
            "fields": {"filepath": {"tier": "hidden"}},
        },
    }
    out = resolve(
        doc,
        # A stale stored entry once put required fields in the
        # universe; they must never reach excluded_paths (the
        # exclusion stage bypasses ExcludeFields.validate and
        # stripping filepath crashes sample serialization).
        universe=["car", "gt", "filepath", "metadata", "frames.id"],
    )
    assert out["excluded_paths"] == ["gt"]


def test_synthesize_default_empty_dataset():
    doc = synthesize_default(None)
    out = resolve(doc, universe=["car", "gt"])
    assert out["active"] == []
    assert out["excluded_paths"] == []
