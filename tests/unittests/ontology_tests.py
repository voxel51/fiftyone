"""
FiftyOne ontology ODM unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-member

import unittest
from datetime import datetime, timezone

from mongoengine.errors import ValidationError

import fiftyone.core.odm as foo
from fiftyone.core.odm import ontology as foo_ontology
from fiftyone.core.odm.ontology import OntologyDocument, OntologyType


class OntologyDocumentTests(unittest.TestCase):
    def setUp(self):
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        OntologyDocument.ensure_indexes()

    def tearDown(self):
        db = foo.get_db_conn()
        db.drop_collection("ontologies")

    def test_create_taxonomy(self):
        doc = OntologyDocument(
            name="vehicle_classes",
            version=1,
            type=OntologyType.TAXONOMY,
            description="Vehicle type hierarchy",
            root={
                "name": "vehicle_type",
                "values": [
                    {"name": "car"},
                    {"name": "motorcycle"},
                ],
            },
        )
        doc.save()

        loaded = OntologyDocument.objects.get(
            name="vehicle_classes", version=1
        )
        self.assertIsNotNone(loaded.created_at)
        self.assertEqual(loaded.name, "vehicle_classes")
        self.assertEqual(loaded.version, 1)
        self.assertEqual(loaded.type, OntologyType.TAXONOMY)
        self.assertEqual(loaded.description, "Vehicle type hierarchy")
        self.assertEqual(loaded.root["name"], "vehicle_type")
        self.assertEqual(len(loaded.root["values"]), 2)

    def test_create_annotation_ontology(self):
        doc = OntologyDocument(
            name="vehicle_damage_ontology",
            version=1,
            type=OntologyType.ANNOTATION_ONTOLOGY,
            description="Vehicle damage annotation ontology",
            root={
                "classes": ["car", "motorcycle", "truck"],
                "attributes": [
                    {
                        "name": "damage_present",
                        "type": "bool",
                        "component": "checkbox",
                    },
                    {
                        "name": "damage_location",
                        "type": "str",
                        "component": "dropdown",
                        "values": [
                            "front",
                            "rear",
                            "driver_side",
                            "passenger_side",
                        ],
                        "when": {
                            "equals": {
                                "field": "damage_present",
                                "value": True,
                            }
                        },
                    },
                    {
                        "name": "damage_severity",
                        "type": "str",
                        "component": "radio",
                        "values": ["minor", "moderate", "severe"],
                        "when": {
                            "equals": {
                                "field": "damage_present",
                                "value": True,
                            }
                        },
                    },
                ],
                "taxonomies": ["vehicle_classes"],
            },
        )
        doc.save()

        loaded = OntologyDocument.objects.get(
            name="vehicle_damage_ontology", version=1
        )
        self.assertIsNotNone(loaded.created_at)
        self.assertEqual(loaded.type, OntologyType.ANNOTATION_ONTOLOGY)
        self.assertIsInstance(loaded.root["classes"], list)
        self.assertEqual(len(loaded.root["classes"]), 3)
        self.assertIsInstance(loaded.root["attributes"], list)
        self.assertEqual(len(loaded.root["attributes"]), 3)
        self.assertEqual(
            loaded.root["attributes"][1]["name"], "damage_location"
        )
        self.assertIn("when", loaded.root["attributes"][1])
        self.assertEqual(loaded.root["taxonomies"], ["vehicle_classes"])

    def test_caller_supplied_version_overwritten_on_first_save(self):
        # version is internal bookkeeping; a caller-supplied value on a
        # brand-new slug is silently replaced with 1.
        doc = OntologyDocument(
            name="brand_new_slug",
            version=99,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        )
        doc.save()
        self.assertEqual(doc.version, 1)

    def test_caller_supplied_version_overwritten_for_existing_slug(self):
        # When the slug already has a lineage, a fresh document with a
        # caller-supplied version is bumped to next-from-DB instead of
        # honoring the supplied value.
        for v in range(1, 4):
            OntologyDocument(
                name="lineage",
                type=OntologyType.TAXONOMY,
                root={"name": "root", "v": v},
            ).save()

        # Now the slug has versions 1, 2, 3. A new construction with
        # version=99 should land at 4, not 99.
        new_doc = OntologyDocument(
            name="lineage",
            version=99,
            type=OntologyType.TAXONOMY,
            root={"name": "root", "v": "fresh"},
        )
        new_doc.save()
        self.assertEqual(new_doc.version, 4)
        self.assertEqual(OntologyDocument.objects(slug="lineage").count(), 4)

    def test_multiple_versions(self):
        for v in range(1, 4):
            OntologyDocument(
                name="versioned",
                version=v,
                type=OntologyType.TAXONOMY,
                description=f"Version {v}",
                root={"name": "root", "version_data": v},
            ).save()

        all_versions = OntologyDocument.objects(name="versioned")
        self.assertEqual(all_versions.count(), 3)

        latest = (
            OntologyDocument.objects(name="versioned")
            .order_by("-version")
            .first()
        )
        self.assertEqual(latest.version, 3)
        self.assertEqual(latest.root["version_data"], 3)

    def test_invalid_type_rejected(self):
        doc = OntologyDocument(
            name="bad_type",
            version=1,
            type="invalid_type",
            root={},
        )
        with self.assertRaises(ValidationError):
            doc.save()

    def test_old_conditional_attributes_type_rejected(self):
        doc = OntologyDocument(
            name="old_type",
            version=1,
            type="conditional_attributes",
            root={},
        )
        with self.assertRaises(ValidationError):
            doc.save()

    def test_serialization(self):
        now = datetime.now(timezone.utc)
        doc = OntologyDocument(
            name="serialize_test",
            version=1,
            type="taxonomy",
            description="test",
            root={"name": "root", "values": [{"name": "child"}]},
            created_at=now,
        )
        doc.save()

        d = doc.to_dict()
        self.assertEqual(d["name"], "serialize_test")
        self.assertEqual(d["version"], 1)
        self.assertEqual(d["type"], OntologyType.TAXONOMY)

        restored = OntologyDocument.from_dict(d)
        self.assertEqual(restored.name, doc.name)
        self.assertEqual(restored.version, doc.version)
        self.assertEqual(restored.root, doc.root)

    def test_same_name_different_types(self):
        OntologyDocument(
            name="shared_name",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        OntologyDocument(
            name="shared_name",
            version=2,
            type=OntologyType.ANNOTATION_ONTOLOGY,
            root={"classes": [], "attributes": [], "taxonomies": []},
        ).save()

        docs = OntologyDocument.objects(name="shared_name")
        self.assertEqual(docs.count(), 2)

    def test_query_by_type(self):
        OntologyDocument(
            name="tax1",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()
        OntologyDocument(
            name="tax2",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()
        OntologyDocument(
            name="ao1",
            version=1,
            type=OntologyType.ANNOTATION_ONTOLOGY,
            root={"classes": [], "attributes": [], "taxonomies": []},
        ).save()

        taxonomies = OntologyDocument.objects(type=OntologyType.TAXONOMY)
        self.assertEqual(taxonomies.count(), 2)

        annotation_ontologies = OntologyDocument.objects(
            type=OntologyType.ANNOTATION_ONTOLOGY
        )
        self.assertEqual(annotation_ontologies.count(), 1)

    def test_slug_populated_on_save(self):
        doc = OntologyDocument(
            name="Vehicle Classes",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        )
        doc.save()

        self.assertEqual(doc.slug, "vehicle-classes")

        loaded = OntologyDocument.objects.get(
            slug="vehicle-classes", version=1
        )
        self.assertEqual(loaded.name, "Vehicle Classes")

    def test_slug_sanitizes_name(self):
        doc = OntologyDocument(
            name="My_Ontology.v1!",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        self.assertEqual(doc.slug, "my-ontology-v1")

    def test_case_variant_names_land_in_same_lineage(self):
        # "Cars" and "CARS" normalize to the same slug, so two new-doc
        # saves append to the same lineage (versions 1 and 2) rather than
        # colliding on the unique (slug, version) index — the version is
        # computed from the DB on each save.
        OntologyDocument(
            name="Cars",
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        OntologyDocument(
            name="CARS",
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        docs = OntologyDocument.objects(slug="cars").order_by("version")
        self.assertEqual([d.version for d in docs], [1, 2])

    def test_slug_differs_across_versions(self):
        for v in range(1, 4):
            OntologyDocument(
                name="My Ontology",
                version=v,
                type=OntologyType.TAXONOMY,
                root={"name": "root"},
            ).save()

        docs = OntologyDocument.objects(slug="my-ontology")
        self.assertEqual(docs.count(), 3)

    def test_invalid_name_rejected(self):
        doc = OntologyDocument(
            name="!!!",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        )
        with self.assertRaises(ValueError):
            doc.save()

    def test_delete(self):
        doc = OntologyDocument(
            name="to_delete",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        self.assertEqual(OntologyDocument.objects(name="to_delete").count(), 1)

        doc.delete()

        self.assertEqual(OntologyDocument.objects(name="to_delete").count(), 0)

    def test_save_creates_new_version(self):
        doc = OntologyDocument(
            name="versioning_test",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()
        self.assertIsNotNone(doc.created_at)
        self.assertEqual(doc.version, 1)
        original_id = doc.id

        # Saving an existing doc creates a new version and re-points self
        # at the new row.
        doc.description = "updated"
        result = doc.save()

        self.assertIs(result, doc)
        self.assertEqual(doc.version, 2)
        self.assertNotEqual(doc.id, original_id)
        self.assertIsNotNone(doc.created_at)

        # Both versions exist in the database
        all_versions = OntologyDocument.objects(name="versioning_test")
        self.assertEqual(all_versions.count(), 2)

        # Original row is unchanged
        original = OntologyDocument.objects.get(id=original_id)
        self.assertIsNone(original.description)
        self.assertEqual(original.version, 1)

        # New row has the update
        latest = OntologyDocument.objects.get(id=doc.id)
        self.assertEqual(latest.description, "updated")
        self.assertEqual(latest.version, 2)

    def test_save_bumps_version_across_case_only_rename(self):
        doc = OntologyDocument(
            name="My Ontology",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()
        original_slug = doc.slug

        # Renaming to a case variant of the original name keeps the same slug;
        # the next version should chain off the existing slug, not restart at 1.
        doc.name = "my ontology"
        doc.save()

        self.assertEqual(doc.slug, original_slug)
        self.assertEqual(doc.version, 2)
        self.assertEqual(
            OntologyDocument.objects(slug=original_slug).count(), 2
        )

    def test_save_rejects_slug_change(self):
        doc = OntologyDocument(
            name="cars",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()

        # Changing to a name that produces a different slug breaks lineage —
        # rename_ontology() is the supported way to rename.
        doc.name = "vehicles"
        with self.assertRaises(ValueError):
            doc.save()

        # Failed save leaves only the original row.
        self.assertEqual(OntologyDocument.objects().count(), 1)

    def test_save_returns_self(self):
        doc = OntologyDocument(
            name="returns_self",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        # New save also returns the same instance.
        self.assertIs(doc.save(), doc)

        # Versioned save updates and returns the same instance.
        doc.description = "v2"
        self.assertIs(doc.save(), doc)
        self.assertEqual(doc.version, 2)
        self.assertEqual(doc.description, "v2")

    def test_schema_version_stamped_on_new_save(self):
        doc = OntologyDocument(
            name="schema_version_test",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()
        self.assertEqual(
            doc.schema_version, foo_ontology.CURRENT_SCHEMA_VERSION
        )

    def test_schema_version_overwritten_on_versioned_save(self):
        doc = OntologyDocument(
            name="schema_version_test",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()

        # A stale in-memory schema_version must not survive a save: the
        # next-version write should always stamp CURRENT_SCHEMA_VERSION.
        doc.schema_version = 999
        doc.description = "updated"
        doc.save()

        self.assertEqual(
            doc.schema_version, foo_ontology.CURRENT_SCHEMA_VERSION
        )


if __name__ == "__main__":
    fo_unittest = unittest.TestLoader().loadTestsFromTestCase(
        OntologyDocumentTests
    )
    unittest.TextTestRunner(verbosity=2).run(fo_unittest)
