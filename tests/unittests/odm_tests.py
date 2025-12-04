"""
FiftyOne odm unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.core.odm.utils as odmu


class ColorSchemeTests(unittest.TestCase):
    def test_color_scheme_serialization(self):
        color_scheme = fo.ColorScheme()

        self.assertIsInstance(color_scheme.id, str)

        d = color_scheme.to_dict()
        also_color_scheme = fo.ColorScheme.from_dict(d)

        self.assertIsInstance(d["_id"], ObjectId)
        assert color_scheme == also_color_scheme

        d = color_scheme.to_dict(extended=True)
        also_color_scheme = fo.ColorScheme.from_dict(d, extended=True)

        self.assertIsInstance(d["_id"], dict)
        assert color_scheme == also_color_scheme


class DocumentTests(unittest.TestCase):
    def test_doc_copy_with_new_id(self):
        dataset_doc = foo.DatasetDocument(
            name="unique",
            slug="unique",
            sample_collection_name="samples.unique",
            version="51.51",
        )

        try:
            dataset_doc.save()

            # Copy with new ID -- ID should be new, _created should be True
            doc_copy = dataset_doc.copy(new_id=True)
            self.assertNotEqual(
                dataset_doc.get_field("id"), doc_copy.get_field("id")
            )
            self.assertTrue(doc_copy._created)

            # Now if we set ID to be same, the doc should be the same
            doc_copy.set_field("id", dataset_doc.get_field("id"))
            self.assertEqual(doc_copy, dataset_doc)

        finally:
            dataset_doc.delete()


class MergeEmbeddedDocFieldsTests(unittest.TestCase):
    class _SubclassedEmbeddedDocField(fof.EmbeddedDocumentField):
        """Lightweight subclass used to mimic dynamic label schemas."""

        pass

    def _build_embedded_field(self, nested_names):
        return {
            "name": "pose",
            "ftype": self._SubclassedEmbeddedDocField,
            "fields": [
                {"name": nested_name, "ftype": fof.FloatField}
                for nested_name in nested_names
            ],
        }

    def test_preserves_list_field_merging_behavior(self):
        merged = odmu._merge_embedded_doc_fields(
            {
                "scores": {
                    "name": "scores",
                    "ftype": fof.ListField,
                    "subfield": fof.FloatField,
                }
            },
            [
                {
                    "name": "scores",
                    "ftype": fof.ListField,
                    "subfield": fof.FloatField,
                }
            ],
        )

        self.assertIn("scores", merged)
        self.assertEqual(merged["scores"]["subfield"], fof.FloatField)

    def test_subfield_conflict_behavior_matches_previous_logic(self):
        merged = odmu._merge_embedded_doc_fields(
            {
                "scores": {
                    "name": "scores",
                    "ftype": fof.ListField,
                    "subfield": fof.FloatField,
                }
            },
            [
                {
                    "name": "scores",
                    "ftype": fof.ListField,
                    "subfield": fof.StringField,
                }
            ],
        )

        self.assertIsNone(merged["scores"]["subfield"])

    def test_merges_subclassed_embedded_fields(self):
        merged = odmu._merge_embedded_doc_fields(
            {"pose": self._build_embedded_field(["x"])},
            [self._build_embedded_field(["score"])],
        )

        pose_fields = merged["pose"]["fields"]
        self.assertIn("x", pose_fields)
        self.assertIn("score", pose_fields)

    def test_accepts_list_inputs_and_normalizes_output(self):
        merged = odmu._merge_embedded_doc_fields(
            [self._build_embedded_field(["x"])],
            [self._build_embedded_field(["y"])],
        )

        self.assertIsInstance(merged, dict)
        self.assertIn("pose", merged)
        self.assertIn("y", merged["pose"]["fields"])

    def test_finalize_handles_subclassed_embedded_fields(self):
        """Test that _finalize_embedded_doc_fields correctly handles subclasses.

        This test catches a bug where _merge_embedded_doc_fields uses issubclass()
        to detect EmbeddedDocumentField subclasses, but _finalize_embedded_doc_fields
        used exact equality (==), causing nested fields to remain in dict format
        instead of being converted back to list format.

        Without the fix, this test fails because:
        1. _merge_embedded_doc_fields converts nested fields to dict (correct)
        2. _finalize_embedded_doc_fields doesn't recognize the subclass
        3. Nested fields remain as dict instead of list
        """
        # Simulate what _merge_embedded_doc_fields produces for subclassed fields
        merged = {
            "pose": {
                "name": "pose",
                "ftype": self._SubclassedEmbeddedDocField,
                "fields": {
                    "x": {"name": "x", "ftype": fof.FloatField},
                    "y": {"name": "y", "ftype": fof.FloatField},
                },
            }
        }

        finalized = odmu._finalize_embedded_doc_fields(merged)

        # The top-level result should be a list
        self.assertIsInstance(finalized, list)
        self.assertEqual(len(finalized), 1)

        # The nested fields should also be converted to a list
        pose_field = finalized[0]
        self.assertEqual(pose_field["name"], "pose")
        self.assertIsInstance(
            pose_field["fields"],
            list,
            "Nested fields should be converted to list format, not remain as dict",
        )
        self.assertEqual(len(pose_field["fields"]), 2)

    def test_full_pipeline_with_subclassed_embedded_fields(self):
        """Test _parse_embedded_doc_list_fields with subclassed EmbeddedDocumentField.

        This tests the complete pipeline: merge → finalize, ensuring that
        subclassed embedded document fields are properly handled end-to-end.
        """
        # Build two embedded field specs with different nested fields
        field1 = self._build_embedded_field(["x", "y"])
        field2 = self._build_embedded_field(["y", "z"])

        # Simulate what _parse_embedded_doc_fields would return for two samples
        fields_dict = {}
        fields_dict = odmu._merge_embedded_doc_fields(fields_dict, [field1])
        fields_dict = odmu._merge_embedded_doc_fields(fields_dict, [field2])

        # Finalize to list format
        finalized = odmu._finalize_embedded_doc_fields(fields_dict)

        # Verify structure
        self.assertIsInstance(finalized, list)
        self.assertEqual(len(finalized), 1)

        pose_field = finalized[0]
        self.assertEqual(pose_field["ftype"], self._SubclassedEmbeddedDocField)

        # Nested fields should be a list with all merged fields
        self.assertIsInstance(pose_field["fields"], list)
        nested_names = {f["name"] for f in pose_field["fields"]}
        self.assertEqual(nested_names, {"x", "y", "z"})

    def test_deeply_nested_embedded_doc_merging(self):
        """Test merging deeply nested embedded document fields.

        This is the minimal reproducible example for the original bug.
        Before the fix, merging deeply nested embedded documents would fail
        with a TypeError because the code tried to mutate list-based inputs
        in-place during recursive merging.

        The bug occurred when:
        1. First sample adds nested fields as a list
        2. Second sample tries to merge into the existing structure
        3. Recursive call received a list but tried to use dict operations

        Example error (before fix):
            TypeError: 'list' object does not support item assignment
        """

        def build_deeply_nested_field():
            """Build a 3-level nested embedded document structure."""
            return {
                "name": "person",
                "ftype": self._SubclassedEmbeddedDocField,
                "fields": [
                    {"name": "name", "ftype": fof.StringField},
                    {
                        "name": "pose",
                        "ftype": self._SubclassedEmbeddedDocField,
                        "fields": [
                            {"name": "x", "ftype": fof.FloatField},
                            {
                                "name": "joint",
                                "ftype": self._SubclassedEmbeddedDocField,
                                "fields": [
                                    {"name": "angle", "ftype": fof.FloatField},
                                ],
                            },
                        ],
                    },
                ],
            }

        def build_deeply_nested_field_variant():
            """Build a variant with additional nested fields."""
            return {
                "name": "person",
                "ftype": self._SubclassedEmbeddedDocField,
                "fields": [
                    {"name": "id", "ftype": fof.IntField},
                    {
                        "name": "pose",
                        "ftype": self._SubclassedEmbeddedDocField,
                        "fields": [
                            {"name": "y", "ftype": fof.FloatField},
                            {
                                "name": "joint",
                                "ftype": self._SubclassedEmbeddedDocField,
                                "fields": [
                                    {
                                        "name": "confidence",
                                        "ftype": fof.FloatField,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

        field1 = build_deeply_nested_field()
        field2 = build_deeply_nested_field_variant()

        # This would raise TypeError before the fix:
        # "TypeError: 'list' object does not support item assignment"
        merged = {}
        merged = odmu._merge_embedded_doc_fields(merged, [field1])
        merged = odmu._merge_embedded_doc_fields(merged, [field2])

        # Verify the merge succeeded and structure is correct
        self.assertIn("person", merged)
        person_fields = merged["person"]["fields"]

        # Should have merged top-level fields: name, id, pose
        self.assertIn("name", person_fields)
        self.assertIn("id", person_fields)
        self.assertIn("pose", person_fields)

        # Check deeply nested structure was merged
        pose_fields = person_fields["pose"]["fields"]
        self.assertIn("x", pose_fields)
        self.assertIn("y", pose_fields)
        self.assertIn("joint", pose_fields)

        # Check 3rd level nesting
        joint_fields = pose_fields["joint"]["fields"]
        self.assertIn("angle", joint_fields)
        self.assertIn("confidence", joint_fields)

        # Now finalize and verify the full pipeline works
        finalized = odmu._finalize_embedded_doc_fields(merged)

        self.assertIsInstance(finalized, list)
        self.assertEqual(len(finalized), 1)

        # Verify all nested levels are lists after finalization
        person = finalized[0]
        self.assertIsInstance(person["fields"], list)

        pose = next(f for f in person["fields"] if f["name"] == "pose")
        self.assertIsInstance(pose["fields"], list)

        joint = next(f for f in pose["fields"] if f["name"] == "joint")
        self.assertIsInstance(joint["fields"], list)


class GetIndexedValuesTests(unittest.TestCase):
    def test_get_indexed_values(self):
        try:
            dataset = fo.Dataset()

            samples = [
                fo.Sample(filepath="sample_%d.jpg" % i) for i in range(10)
            ]
            new_ids = dataset.add_samples(samples)

            dataset.add_sample_field("new_field", fo.IntField)
            dataset.set_values("new_field", [i for i in range(10)])
            dataset.create_index("new_field")
            collection = dataset._sample_collection

            # Check default and custom index fields
            for field in ["filepath", "id", "_id", "new_field"]:

                #  Test for returning values only
                vals = foo.get_indexed_values(
                    collection, field, values_only=True
                )
                self.assertEqual(len(vals), len(samples))
                if field == "_id":
                    expected = set(ObjectId(oid) for oid in new_ids)
                else:
                    expected = set(getattr(s, field) for s in samples)
                self.assertEqual(set(vals), expected)
                # Test that the results are the same as values()
                # but not necessarily the order
                self.assertEqual(set(dataset.values(field)), expected)

                # Test for returning values with field name
                vals = foo.get_indexed_values(collection, field)
                self.assertEqual(len(vals), len(expected))
                result = set({val[field] for val in vals})
                self.assertEqual(result, expected)

            # Test with a field that doesn't exist
            with self.assertRaises(ValueError):
                foo.get_indexed_values(collection, "non_existent_field")

            # Test with a field that is not indexed
            dataset.add_sample_field("new_field2", fo.IntField)
            dataset.set_values("new_field2", [i for i in range(10)])
            with self.assertRaises(ValueError):
                foo.get_indexed_values(collection, "new_field2")

        finally:
            dataset.delete()
