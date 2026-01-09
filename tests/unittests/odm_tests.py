"""
FiftyOne odm unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.odm as foo


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


class SanitizeUnknownEmbeddedDocsTests(unittest.TestCase):
    """Tests for graceful handling of unknown embedded document types."""

    def test_sanitize_simple_unknown_document(self):
        """Test sanitizing a simple unknown embedded document."""
        import fiftyone.core.odm.utils as foou

        data = {
            "field1": "value1",
            "unknown_field": {
                "_cls": "UnknownDocumentType",
                "data": "some_data",
            },
        }

        result = foou.sanitize_unknown_embedded_docs(data)

        # The unknown document should be converted to DynamicEmbeddedDocument
        self.assertEqual(result["field1"], "value1")
        self.assertIn("unknown_field", result)
        # DynamicEmbeddedDocument keeps the data
        self.assertEqual(result["unknown_field"]["data"], "some_data")
        self.assertNotIn("_cls", result["unknown_field"])

    def test_sanitize_nested_unknown_documents(self):
        """Test sanitizing nested unknown embedded documents."""
        import fiftyone.core.odm.utils as foou

        data = {
            "level1": {
                "_cls": "UnknownType1",
                "level2": {
                    "_cls": "UnknownType2",
                    "value": "nested_value",
                },
            },
        }

        result = foou.sanitize_unknown_embedded_docs(data)

        # Both levels should be preserved
        self.assertIn("level1", result)
        self.assertEqual(result["level1"]["level2"]["value"], "nested_value")

    def test_sanitize_list_of_documents(self):
        """Test sanitizing lists containing unknown documents."""
        import fiftyone.core.odm.utils as foou

        data = {
            "items": [
                {"_cls": "UnknownType", "name": "item1"},
                "string_item",
                {"normal_dict": "value"},
            ],
        }

        result = foou.sanitize_unknown_embedded_docs(data)

        self.assertEqual(len(result["items"]), 3)
        self.assertEqual(result["items"][0]["name"], "item1")
        self.assertEqual(result["items"][1], "string_item")
        self.assertEqual(result["items"][2]["normal_dict"], "value")

    def test_sanitize_preserves_known_documents(self):
        """Test that known documents are preserved as-is."""
        import fiftyone.core.odm.utils as foou

        # Create a dict that looks like a FiftyOne document (has _cls but it's known)
        data = {
            "field": "value",
            "nested": {
                "_cls": "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
                "data": "preserved",
            },
        }

        result = foou.sanitize_unknown_embedded_docs(data)

        # Should not raise an error and should preserve structure
        self.assertEqual(result["field"], "value")
        self.assertIn("nested", result)
