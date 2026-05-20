"""
FiftyOne ontology delete cascade unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.odm as foo
from fiftyone.core.annotation.attributes import AttributeSpec
from fiftyone.core.ontology import (
    AnnotationOntology,
    _find_annotation_ontology_refs_by_taxonomy,
    _find_label_schema_refs_by_ontology,
    delete_ontology,
    load_ontology,
)


_ONTOLOGY_NAME = "test_ontology"


def _make_ontology(name: str = _ONTOLOGY_NAME) -> None:
    AnnotationOntology(
        name=name,
        attributes=[
            AttributeSpec(
                name="severity",
                type="str",
                component="dropdown",
                values=["low", "medium", "high"],
            ),
            AttributeSpec(
                name="confirmed",
                type="bool",
                component="checkbox",
            ),
        ],
    ).save()


def _stamp(dataset: fo.Dataset, fields: list[str], ontology_name: str) -> None:
    """Sets ``applied_ontology`` on the given fields by direct doc
    mutation. Bypasses the SDK so the test setup doesn't depend on
    higher-level convenience APIs.
    """
    doc = dataset._doc
    schemas = dict(doc.label_schemas or {})
    for field in fields:
        entry = dict(schemas.get(field) or {})
        entry["applied_ontology"] = ontology_name
        schemas[field] = entry
    doc.label_schemas = schemas
    doc.save()


class DeleteOntologyTests(unittest.TestCase):
    def setUp(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def tearDown(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def test_delete_unreferenced_ontology_succeeds(self) -> None:
        _make_ontology()

        delete_ontology(_ONTOLOGY_NAME)

        self.assertFalse(fo.ontology_exists(_ONTOLOGY_NAME))

    def test_delete_missing_ontology_raises(self) -> None:
        with self.assertRaises(ValueError):
            delete_ontology("nonexistent")

    def test_delete_referenced_ontology_without_force_raises(self) -> None:
        _make_ontology()
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth"], _ONTOLOGY_NAME)

        with self.assertRaises(ValueError):
            delete_ontology(_ONTOLOGY_NAME)

        # Ontology and reference should be untouched.
        self.assertTrue(fo.ontology_exists(_ONTOLOGY_NAME))
        ds.reload()
        self.assertEqual(
            ds._doc.label_schemas["ground_truth"]["applied_ontology"],
            _ONTOLOGY_NAME,
        )

    def test_delete_referenced_ontology_with_force_inlines_and_deletes(
        self,
    ) -> None:
        _make_ontology()
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth"], _ONTOLOGY_NAME)

        delete_ontology(_ONTOLOGY_NAME, force=True)

        # Ontology gone.
        self.assertFalse(fo.ontology_exists(_ONTOLOGY_NAME))

        # Reference stripped, ontology's attributes inlined as locals.
        ds.reload()
        schema = ds._doc.label_schemas["ground_truth"]
        self.assertNotIn("applied_ontology", schema)
        attr_names = {a["name"] for a in schema["attributes"]}
        self.assertEqual(attr_names, {"severity", "confirmed"})

    def test_inlined_attributes_have_no_source_marker(self) -> None:
        _make_ontology()
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth"], _ONTOLOGY_NAME)

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds.reload()
        for attr in ds._doc.label_schemas["ground_truth"]["attributes"]:
            self.assertNotIn("_source", attr)

    def test_force_inlines_across_multiple_datasets(self) -> None:
        _make_ontology()
        ds_a = fo.Dataset()
        ds_b = fo.Dataset()
        _stamp(ds_a, ["ground_truth"], _ONTOLOGY_NAME)
        _stamp(ds_b, ["predictions"], _ONTOLOGY_NAME)

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds_a.reload()
        ds_b.reload()
        self.assertNotIn(
            "applied_ontology", ds_a._doc.label_schemas["ground_truth"]
        )
        self.assertNotIn(
            "applied_ontology", ds_b._doc.label_schemas["predictions"]
        )
        self.assertEqual(
            {
                a["name"]
                for a in ds_a._doc.label_schemas["ground_truth"]["attributes"]
            },
            {"severity", "confirmed"},
        )
        self.assertEqual(
            {
                a["name"]
                for a in ds_b._doc.label_schemas["predictions"]["attributes"]
            },
            {"severity", "confirmed"},
        )

    def test_force_inlines_multiple_fields_on_one_dataset(self) -> None:
        _make_ontology()
        ds = fo.Dataset()
        _stamp(
            ds,
            ["ground_truth", "predictions", "custom_attrs"],
            _ONTOLOGY_NAME,
        )

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds.reload()
        for field in ("ground_truth", "predictions", "custom_attrs"):
            schema = ds._doc.label_schemas[field]
            self.assertNotIn("applied_ontology", schema)
            self.assertEqual(
                {a["name"] for a in schema["attributes"]},
                {"severity", "confirmed"},
            )

    def test_local_attrs_preserved_on_inline(self) -> None:
        # Catches a regression where the inline drops user-authored
        # local attributes alongside the ontology-owned ones.
        _make_ontology()
        ds = fo.Dataset()
        ds._doc.label_schemas = {
            "ground_truth": {
                "type": "detections",
                "applied_ontology": _ONTOLOGY_NAME,
                "attributes": [
                    {
                        "name": "local_only",
                        "type": "str",
                        "component": "text",
                    },
                ],
            }
        }
        ds._doc.save()

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds.reload()
        names = {
            a["name"]
            for a in ds._doc.label_schemas["ground_truth"]["attributes"]
        }
        self.assertEqual(names, {"local_only", "severity", "confirmed"})

    def test_collision_ontology_wins(self) -> None:
        # On name collision, the ontology's shape replaces the local
        # one. Local ``severity`` is bool/checkbox; ontology's is
        # str/dropdown — the survivor tells us which won.
        _make_ontology()
        ds = fo.Dataset()
        ds._doc.label_schemas = {
            "ground_truth": {
                "applied_ontology": _ONTOLOGY_NAME,
                "attributes": [
                    {
                        "name": "severity",
                        "type": "bool",
                        "component": "checkbox",
                    },
                ],
            }
        }
        ds._doc.save()

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds.reload()
        severity = next(
            a
            for a in ds._doc.label_schemas["ground_truth"]["attributes"]
            if a["name"] == "severity"
        )
        self.assertEqual(severity["type"], "str")
        self.assertEqual(severity["component"], "dropdown")

    def test_other_ontology_refs_on_same_dataset_untouched(self) -> None:
        # If a dataset references the deleted ontology and a different
        # ontology on different fields, only the deleted one's field
        # should be inlined.
        _make_ontology()
        _make_ontology(name="other_ontology")
        ds = fo.Dataset()
        ds._doc.label_schemas = {
            "ground_truth": {"applied_ontology": _ONTOLOGY_NAME},
            "predictions": {"applied_ontology": "other_ontology"},
        }
        ds._doc.save()

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds.reload()
        self.assertNotIn(
            "applied_ontology", ds._doc.label_schemas["ground_truth"]
        )
        self.assertEqual(
            ds._doc.label_schemas["predictions"]["applied_ontology"],
            "other_ontology",
        )

    def test_non_referencing_datasets_untouched(self) -> None:
        _make_ontology()
        ds_referenced = fo.Dataset()
        _stamp(ds_referenced, ["ground_truth"], _ONTOLOGY_NAME)

        ds_other = fo.Dataset()
        ds_other._doc.label_schemas = {"ground_truth": {"type": "detections"}}
        ds_other._doc.save()
        snapshot_before = dict(ds_other._doc.label_schemas)

        delete_ontology(_ONTOLOGY_NAME, force=True)

        ds_other.reload()
        self.assertEqual(dict(ds_other._doc.label_schemas), snapshot_before)

    def test_rerun_after_deleted_raises(self) -> None:
        _make_ontology()
        delete_ontology(_ONTOLOGY_NAME)

        with self.assertRaises(ValueError):
            delete_ontology(_ONTOLOGY_NAME)


class FindLabelSchemaRefsTests(unittest.TestCase):
    def setUp(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def tearDown(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def test_no_datasets_returns_empty(self) -> None:
        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)
        self.assertEqual(result, [])

    def test_no_references_returns_empty(self) -> None:
        fo.Dataset()
        fo.Dataset()
        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)
        self.assertEqual(result, [])

    def test_single_dataset_single_field(self) -> None:
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth"], _ONTOLOGY_NAME)

        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].dataset_id, str(ds._doc.id))
        self.assertEqual(result[0].field_names, ["ground_truth"])

    def test_single_dataset_multiple_fields(self) -> None:
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth", "predictions"], _ONTOLOGY_NAME)

        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)

        self.assertEqual(len(result), 1)
        self.assertEqual(
            set(result[0].field_names), {"ground_truth", "predictions"}
        )

    def test_multiple_datasets(self) -> None:
        ds_a = fo.Dataset()
        ds_b = fo.Dataset()
        _stamp(ds_a, ["ground_truth"], _ONTOLOGY_NAME)
        _stamp(ds_b, ["predictions"], _ONTOLOGY_NAME)

        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)

        self.assertEqual(len(result), 2)
        ids = {ref.dataset_id for ref in result}
        self.assertEqual(ids, {str(ds_a._doc.id), str(ds_b._doc.id)})

    def test_excludes_other_ontologies(self) -> None:
        ds = fo.Dataset()
        _stamp(ds, ["ground_truth"], "different_ontology")

        result = _find_label_schema_refs_by_ontology(_ONTOLOGY_NAME)

        self.assertEqual(result, [])


_TAXONOMY_NAME = "test_taxonomy"


def _make_taxonomy(name: str = _TAXONOMY_NAME) -> None:
    from fiftyone.core.annotation.nodes import Node
    from fiftyone.core.ontology import Taxonomy

    Taxonomy(
        name=name,
        root=Node(name="root", values=[Node(name="a"), Node(name="b")]),
    ).save()


def _make_ao_bundling_taxonomy(
    ao_name: str, taxonomy_name: str = _TAXONOMY_NAME
) -> None:
    AnnotationOntology(name=ao_name, taxonomy=taxonomy_name).save()


class DeleteTaxonomyTests(unittest.TestCase):
    def setUp(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def tearDown(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        fo.delete_non_persistent_datasets()

    def test_delete_unreferenced_taxonomy_succeeds(self) -> None:
        _make_taxonomy()

        delete_ontology(_TAXONOMY_NAME)

        self.assertFalse(fo.ontology_exists(_TAXONOMY_NAME))

    def test_delete_referenced_taxonomy_without_force_raises(self) -> None:
        _make_taxonomy()
        _make_ao_bundling_taxonomy("my_ao")

        with self.assertRaises(ValueError):
            delete_ontology(_TAXONOMY_NAME)

        # Taxonomy and AO ref should be untouched.
        self.assertTrue(fo.ontology_exists(_TAXONOMY_NAME))
        self.assertEqual(load_ontology("my_ao").taxonomy, _TAXONOMY_NAME)

    def test_force_delete_taxonomy_unsets_ao_ref_and_deletes(self) -> None:
        _make_taxonomy()
        _make_ao_bundling_taxonomy("my_ao")

        delete_ontology(_TAXONOMY_NAME, force=True)

        # Taxonomy gone.
        self.assertFalse(fo.ontology_exists(_TAXONOMY_NAME))
        # AO survives without its bundled taxonomy.
        self.assertIsNone(load_ontology("my_ao").taxonomy)

    def test_force_delete_taxonomy_unsets_via_new_ao_version(self) -> None:
        # Append-only: the unset is an appended version, not an in-place
        # mutation. The latest AO version no longer carries the ref;
        # whether prior versions still do is unspecified by this API.
        _make_taxonomy()
        _make_ao_bundling_taxonomy("my_ao")
        ao_before = load_ontology("my_ao")

        delete_ontology(_TAXONOMY_NAME, force=True)

        ao_after = load_ontology("my_ao")
        self.assertGreater(ao_after.version, ao_before.version)
        self.assertIsNone(ao_after.taxonomy)

    def test_force_delete_taxonomy_does_not_touch_label_schemas(
        self,
    ) -> None:
        # applied_taxonomy is a hydration-time output, never persisted.
        # The cascade scans AOs, not label schemas.
        _make_taxonomy()
        ds = fo.Dataset()
        ds._doc.label_schemas = {
            "ground_truth": {
                "type": "detections",
                "applied_ontology": "some_ao",
            }
        }
        ds._doc.save()
        snapshot = dict(ds._doc.label_schemas)

        delete_ontology(_TAXONOMY_NAME, force=True)

        ds.reload()
        self.assertEqual(dict(ds._doc.label_schemas), snapshot)


class FindAnnotationOntologyRefsByTaxonomyTests(unittest.TestCase):
    def setUp(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")

    def tearDown(self) -> None:
        db = foo.get_db_conn()
        db.drop_collection("ontologies")

    def test_no_ontologies_returns_empty(self) -> None:
        self.assertEqual(
            _find_annotation_ontology_refs_by_taxonomy(_TAXONOMY_NAME), []
        )

    def test_unrelated_ao_excluded(self) -> None:
        AnnotationOntology(name="no_tax_ao").save()
        self.assertEqual(
            _find_annotation_ontology_refs_by_taxonomy(_TAXONOMY_NAME), []
        )

    def test_finds_ao_bundling_taxonomy(self) -> None:
        _make_taxonomy()
        _make_ao_bundling_taxonomy("my_ao")

        self.assertEqual(
            _find_annotation_ontology_refs_by_taxonomy(_TAXONOMY_NAME),
            ["my_ao"],
        )

    def test_latest_version_only(self) -> None:
        # If the latest AO version no longer references the taxonomy
        # (older versions did), the AO should NOT appear in the result.
        _make_taxonomy()
        _make_ao_bundling_taxonomy("my_ao")

        ao = load_ontology("my_ao")
        ao.taxonomy = None
        ao.save()

        self.assertEqual(
            _find_annotation_ontology_refs_by_taxonomy(_TAXONOMY_NAME), []
        )


if __name__ == "__main__":
    unittest.main()
