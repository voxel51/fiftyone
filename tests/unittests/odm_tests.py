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
