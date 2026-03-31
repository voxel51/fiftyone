"""
FiftyOne ontology ODM unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-member

import unittest
from datetime import datetime

from mongoengine.errors import ValidationError
from pymongo.errors import DuplicateKeyError

import fiftyone.core.odm as foo
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

    def test_create_conditional_attributes(self):
        doc = OntologyDocument(
            name="vehicle_damage_attributes",
            version=1,
            type=OntologyType.CONDITIONAL_ATTRIBUTES,
            description="Vehicle damage condition attributes",
            root=[
                {
                    "name": "damage_location",
                    "when": {
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                },
                {
                    "name": "damage_severity",
                    "when": {
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                },
            ],
        )
        doc.save()

        loaded = OntologyDocument.objects.get(
            name="vehicle_damage_attributes", version=1
        )
        self.assertIsNotNone(loaded.created_at)
        self.assertEqual(loaded.type, OntologyType.CONDITIONAL_ATTRIBUTES)
        self.assertIsInstance(loaded.root, list)
        self.assertEqual(len(loaded.root), 2)
        self.assertEqual(loaded.root[0]["name"], "damage_location")

    def test_name_version_uniqueness(self):
        OntologyDocument(
            name="test_ontology",
            version=1,
            type=OntologyType.TAXONOMY,
            root={"name": "root"},
        ).save()

        with self.assertRaises(DuplicateKeyError):
            OntologyDocument(
                name="test_ontology",
                version=1,
                type=OntologyType.TAXONOMY,
                root={"name": "root"},
            ).save()

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

    def test_serialization(self):
        now = datetime.utcnow()
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

    def test_last_modified_at_auto_updates(self):
        doc = OntologyDocument(
            name="timestamp_test",
            version=1,
            type="taxonomy",
            root={"name": "root"},
        )
        doc.save()
        self.assertIsNotNone(doc.created_at)

        original_modified = doc.last_modified_at

        doc.description = "updated"
        doc.save()
        doc.reload()

        self.assertIsNotNone(doc.last_modified_at)
        self.assertNotEqual(doc.last_modified_at, original_modified)

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
            type=OntologyType.CONDITIONAL_ATTRIBUTES,
            root=[{"name": "attr"}],
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
            name="ca1",
            version=1,
            type=OntologyType.CONDITIONAL_ATTRIBUTES,
            root=[],
        ).save()

        taxonomies = OntologyDocument.objects(type=OntologyType.TAXONOMY)
        self.assertEqual(taxonomies.count(), 2)

        conditionals = OntologyDocument.objects(
            type=OntologyType.CONDITIONAL_ATTRIBUTES
        )
        self.assertEqual(conditionals.count(), 1)

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


if __name__ == "__main__":
    fo_unittest = unittest.TestLoader().loadTestsFromTestCase(
        OntologyDocumentTests
    )
    unittest.TextTestRunner(verbosity=2).run(fo_unittest)
