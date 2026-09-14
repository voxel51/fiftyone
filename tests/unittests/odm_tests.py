"""
FiftyOne odm unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from functools import partial

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou


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

    def test_color_scheme_temporal_tags(self):
        temporal_tags = {
            "fieldColor": "#ff6d04",
            "valueColors": [{"value": "pedestrian", "color": "#3b82f6"}],
        }
        color_scheme = fo.ColorScheme(temporal_tags=temporal_tags)

        self.assertEqual(color_scheme.temporal_tags, temporal_tags)

        # temporal tag colors survive a serialization round-trip
        d = color_scheme.to_dict()
        also_color_scheme = fo.ColorScheme.from_dict(d)

        self.assertEqual(also_color_scheme.temporal_tags, temporal_tags)
        assert color_scheme == also_color_scheme

        d = color_scheme.to_dict(extended=True)
        also_color_scheme = fo.ColorScheme.from_dict(d, extended=True)

        self.assertEqual(also_color_scheme.temporal_tags, temporal_tags)
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


class _GetImpliedInner(foo.EmbeddedDocument):
    x = fof.FloatField()
    score = fof.FloatField()


class _GetImpliedSubclassedEmbeddedDocField(fof.EmbeddedDocumentField):
    """Lightweight subclass used to mimic plugin-provided embedded fields."""

    pass


class _GetImpliedOuter(foo.EmbeddedDocument):
    # Use a subclassed `EmbeddedDocumentField` so that `ftype` in the inferred
    # schema is a subclass, not the base `EmbeddedDocumentField`
    pose = _GetImpliedSubclassedEmbeddedDocField(_GetImpliedInner)


class GetImpliedFieldKwargsTests(unittest.TestCase):
    """Integration-style tests that exercise `_merge_embedded_doc_fields`
    via the public :func:`get_implied_field_kwargs` API.
    """

    def test_list_of_embedded_docs_merges_nested_schema(self):
        # Two `_GetImpliedOuter` documents whose nested `_GetImpliedInner`
        # subdocuments populate
        # different fields. The merged schema for `pose` should be the union
        # of the observed inner fields.
        inner_with_x = _GetImpliedInner(x=1.0)
        inner_with_score = _GetImpliedInner(score=0.5)

        values = [
            _GetImpliedOuter(pose=inner_with_x),
            _GetImpliedOuter(pose=inner_with_score),
        ]

        kwargs = foo.get_implied_field_kwargs(values)

        # Top-level: list of `_GetImpliedOuter` embedded documents
        self.assertEqual(kwargs["ftype"], fof.ListField)
        self.assertEqual(kwargs["subfield"], fof.EmbeddedDocumentField)
        self.assertEqual(kwargs["embedded_doc_type"], _GetImpliedOuter)

        # Nested: `pose` should itself be an embedded document whose schema
        # includes both `x` and `score`, demonstrating that nested embedded
        # schemas from multiple list elements are correctly merged when the
        # field type is a subclass of `EmbeddedDocumentField`
        pose_spec = next(f for f in kwargs["fields"] if f["name"] == "pose")
        self.assertTrue(
            issubclass(pose_spec["ftype"], fof.EmbeddedDocumentField)
        )
        self.assertEqual(pose_spec["embedded_doc_type"], _GetImpliedInner)

        inner_field_names = {f["name"] for f in pose_spec["fields"]}
        self.assertEqual(inner_field_names, {"x", "score"})


class _Refused(Exception):
    pass


class _FakeCollection:
    """A pymongo collection stand-in that records what it was asked to
    write."""

    def __init__(self, name):
        self.name = name
        self.batch_sizes = []

    def insert_many(self, docs, ordered=False):
        self.batch_sizes.append(len(docs))
        return object()


class InsertAdmitterTests(unittest.TestCase):
    def setUp(self):
        self._admitters = list(foo.database._insert_admitters)
        foo.database._insert_admitters.clear()

    def tearDown(self):
        foo.database._insert_admitters[:] = self._admitters

    def test_no_admitters(self):
        foo.database._admit_insert("samples.test", 10)

    def test_admitter_receives_collection_and_count(self):
        calls = []
        foo.database.register_insert_admitter(
            lambda name, num_docs: calls.append((name, num_docs))
        )

        foo.database._admit_insert("samples.test", 7)

        self.assertEqual(calls, [("samples.test", 7)])

    def test_admitters_are_consulted_in_registration_order(self):
        calls = []
        foo.database.register_insert_admitter(
            lambda name, num_docs: calls.append("first")
        )
        foo.database.register_insert_admitter(
            lambda name, num_docs: calls.append("second")
        )

        foo.database._admit_insert("samples.test", 1)

        self.assertEqual(calls, ["first", "second"])

    def test_registering_twice_admits_once(self):
        calls = []

        def admitter(name, num_docs):
            calls.append((name, num_docs))

        foo.database.register_insert_admitter(admitter)
        foo.database.register_insert_admitter(admitter)

        foo.database._admit_insert("samples.test", 1)

        self.assertEqual(calls, [("samples.test", 1)])

    def test_refusal_propagates(self):
        def admitter(name, num_docs):
            raise _Refused

        foo.database.register_insert_admitter(admitter)

        with self.assertRaises(_Refused):
            foo.database._admit_insert("samples.test", 1)

    def test_insert_documents_admits_each_batch(self):
        calls = []
        foo.database.register_insert_admitter(
            lambda name, num_docs: calls.append((name, num_docs))
        )

        coll = _FakeCollection("samples.test")
        docs = ({"_id": ObjectId()} for _ in range(5))

        foo.insert_documents(
            docs,
            coll,
            batcher=partial(fou.StaticBatcher, batch_size=2),
            progress=False,
        )

        # the counts are the batches actually written, and a generator
        # input does not hide them
        self.assertEqual(coll.batch_sizes, [2, 2, 1])
        self.assertEqual(
            calls,
            [("samples.test", 2), ("samples.test", 2), ("samples.test", 1)],
        )

    def test_insert_documents_does_not_write_a_refused_batch(self):
        def admitter(name, num_docs):
            raise _Refused

        foo.database.register_insert_admitter(admitter)

        coll = _FakeCollection("samples.test")

        with self.assertRaises(_Refused):
            foo.insert_documents(
                [{"_id": ObjectId()}],
                coll,
                batcher=False,
                progress=False,
            )

        self.assertEqual(coll.batch_sizes, [])


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
