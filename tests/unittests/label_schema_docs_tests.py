"""Unit tests for ``fiftyone.core.label_schema_docs`` (named schema docs)."""

import pytest

import fiftyone.core.label_schema_docs as docs
from fiftyone.core.label_schema_docs import (
    normalize_visibility,
    resolve,
    synthesize_default,
)

from label_schema_memory import DATASET_ID as DS
from label_schema_memory import memory_db  # noqa: F401  (fixture)

# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.usefixtures("memory_db")


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
                    "state": "annotate",
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


def test_resolve_never_excludes_media_reference_or_given_protected_paths():
    # media_reference is a reference-backed dataset's media identity, the
    # group field ties a group dataset's slices together
    doc = {
        "id": "d",
        "name": "n",
        "label_schema": {},
        "visibility": {
            "default": "hidden",
            "fields": {
                "media_reference": {"tier": "hidden"},
                "group": {"tier": "hidden"},
            },
        },
    }
    universe = ["gt", "group", "media_reference"]

    out = resolve(doc, universe, protected=docs.PROTECTED_PATHS | {"group"})
    assert out["excluded_paths"] == ["gt"]

    # without the dataset's protected paths, only the static ones hold
    assert resolve(doc, universe)["excluded_paths"] == ["group", "gt"]


def test_synthesize_default_empty_dataset():
    doc = synthesize_default(None)
    out = resolve(doc, universe=["car", "gt"])
    assert out["active"] == []
    assert out["excluded_paths"] == []


def test_update_refuses_a_stale_version():
    doc = docs.create(dataset_id=DS, name="shared")
    assert doc["version"] == 1
    bumped = docs.update(
        doc["id"], dataset_id=DS, description="first", expected_version=1
    )
    assert bumped["version"] == 2
    with pytest.raises(ValueError, match="changed by someone else"):
        docs.update(
            doc["id"], dataset_id=DS, description="stale", expected_version=1
        )
    # Unconditional updates still work, and a missing doc is None.
    assert (
        docs.update(doc["id"], dataset_id=DS, description="x")["version"] == 3
    )
    assert docs.update("missing", dataset_id=DS, expected_version=1) is None


def test_label_schema_content_is_validated():
    with pytest.raises(ValueError, match="mapping"):
        docs.create(
            dataset_id=DS, name="bad", label_schema=["not", "a", "map"]
        )
    with pytest.raises(ValueError, match="mapping"):
        docs.create(dataset_id=DS, name="bad", label_schema={"car": "nope"})
    with pytest.raises(ValueError, match="non-empty"):
        docs.create(dataset_id=DS, name="bad", label_schema={"": {}})
    huge = {"car": {"classes": ["x" * 1000] * 2000}}
    with pytest.raises(ValueError, match="too large"):
        docs.create(dataset_id=DS, name="bad", label_schema=huge)
    doc = docs.create(dataset_id=DS, name="ok", label_schema={"car": {}})
    with pytest.raises(ValueError, match="mapping"):
        docs.update(doc["id"], dataset_id=DS, label_schema={"car": 1})
    with pytest.raises(ValueError, match="mapping"):
        docs.propagate_field("new", "nope", dataset_id=DS)


def test_list_returns_summaries_without_content():
    docs.create(
        dataset_id=DS,
        name="summary",
        label_schema={"car": {"type": "detections"}},
        visibility={"fields": {"gt": {"tier": "hidden"}}},
    )
    (row,) = docs.list_(dataset_id=DS)
    assert set(row) == {"id", "name", "description", "updated_at", "version"}
