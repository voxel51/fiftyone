"""
FiftyOne odm unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from functools import partial

from bson import ObjectId
from pymongo.errors import BulkWriteError
from pymongo.results import InsertManyResult

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


class _Refused(foo.InsertRefusedError):
    pass


class _Admitter(foo.InsertAdmitter):
    """An admitter that logs every consultation to a shared list."""

    def __init__(self, calls, tag="admitter", refuse=False):
        self.calls = calls
        self.tag = tag
        self.refuse = refuse

    def admit(self, collection_name, num_docs):
        if self.refuse:
            raise _Refused

        self.calls.append((self.tag, "admit", collection_name, num_docs))

    def record(self, collection_name, num_docs):
        self.calls.append((self.tag, "record", collection_name, num_docs))


class _IndistinctAdmitter(_Admitter):
    """An admitter that compares equal to every other."""

    def __eq__(self, other):
        return True

    __hash__ = object.__hash__


class _FakeCollection:
    """A pymongo collection stand-in that records what it was asked to
    write."""

    def __init__(self, name, fail_after=None):
        self.name = name
        self.batch_sizes = []
        self.fail_after = fail_after

    def insert_many(self, docs, ordered=False):
        self.batch_sizes.append(len(docs))
        if self.fail_after is not None:
            raise BulkWriteError(
                {
                    "nInserted": self.fail_after,
                    "writeErrors": [{"errmsg": "duplicate key"}],
                }
            )

        return InsertManyResult([d["_id"] for d in docs], acknowledged=True)


class InsertAdmitterTests(unittest.TestCase):
    def setUp(self):
        self._admitters = list(foo.database._insert_admitters)
        foo.database._insert_admitters.clear()
        self.calls = []

    def tearDown(self):
        foo.database._insert_admitters[:] = self._admitters

    def _admits(self):
        return [c[1:] for c in self.calls if c[1] == "admit"]

    def _records(self):
        return [c[1:] for c in self.calls if c[1] == "record"]

    def test_no_admitters(self):
        foo.database._admit_insert("samples.test", 10)
        foo.database._record_insert("samples.test", 10)

    def test_base_admitter_admits_everything(self):
        foo.register_insert_admitter(foo.InsertAdmitter())

        foo.database._admit_insert("samples.test", 10)
        foo.database._record_insert("samples.test", 10)

    def test_admitter_receives_collection_and_count(self):
        foo.register_insert_admitter(_Admitter(self.calls))

        foo.database._admit_insert("samples.test", 7)
        foo.database._record_insert("samples.test", 5)

        self.assertEqual(
            self.calls,
            [
                ("admitter", "admit", "samples.test", 7),
                ("admitter", "record", "samples.test", 5),
            ],
        )

    def test_admitters_are_consulted_in_registration_order(self):
        foo.register_insert_admitter(_Admitter(self.calls, tag="first"))
        foo.register_insert_admitter(_Admitter(self.calls, tag="second"))

        foo.database._admit_insert("samples.test", 1)

        self.assertEqual([c[0] for c in self.calls], ["first", "second"])

    def test_registering_twice_registers_once(self):
        admitter = _Admitter(self.calls)

        foo.register_insert_admitter(admitter)
        foo.register_insert_admitter(admitter)

        foo.database._admit_insert("samples.test", 1)

        self.assertEqual(len(self.calls), 1)

    def test_registration_is_by_identity(self):
        # two distinct admitters that happen to compare equal are two
        # admitters, and each is consulted
        foo.register_insert_admitter(_IndistinctAdmitter(self.calls, "one"))
        foo.register_insert_admitter(_IndistinctAdmitter(self.calls, "two"))

        foo.database._admit_insert("samples.test", 1)

        self.assertEqual([c[0] for c in self.calls], ["one", "two"])

    def test_unregister(self):
        admitter = _Admitter(self.calls)
        foo.register_insert_admitter(admitter)

        foo.unregister_insert_admitter(admitter)
        foo.unregister_insert_admitter(admitter)
        foo.database._admit_insert("samples.test", 1)

        self.assertEqual(self.calls, [])

    def test_refusal_propagates(self):
        foo.register_insert_admitter(_Admitter(self.calls, refuse=True))

        with self.assertRaises(_Refused):
            foo.database._admit_insert("samples.test", 1)

    def test_insert_documents_admits_the_whole_write_up_front(self):
        foo.register_insert_admitter(_Admitter(self.calls))

        coll = _FakeCollection("samples.test")
        docs = [{"_id": ObjectId()} for _ in range(5)]

        foo.insert_documents(
            docs,
            coll,
            batcher=partial(fou.StaticBatcher, batch_size=2),
            progress=False,
        )

        # the whole write is admitted before anything is written, then each
        # batch is admitted and recorded as it lands
        self.assertEqual(coll.batch_sizes, [2, 2, 1])
        self.assertEqual(
            self.calls,
            [
                ("admitter", "admit", "samples.test", 5),
                ("admitter", "admit", "samples.test", 2),
                ("admitter", "record", "samples.test", 2),
                ("admitter", "admit", "samples.test", 2),
                ("admitter", "record", "samples.test", 2),
                ("admitter", "admit", "samples.test", 1),
                ("admitter", "record", "samples.test", 1),
            ],
        )

    def test_insert_documents_admits_each_batch_of_a_generator(self):
        foo.register_insert_admitter(_Admitter(self.calls))

        coll = _FakeCollection("samples.test")
        docs = ({"_id": ObjectId()} for _ in range(5))

        foo.insert_documents(
            docs,
            coll,
            batcher=partial(fou.StaticBatcher, batch_size=2),
            progress=False,
        )

        # a generator's size is unknown up front, so only the batches are
        # admitted, each as it is materialized
        self.assertEqual(coll.batch_sizes, [2, 2, 1])
        self.assertEqual(
            self._admits(),
            [
                ("admit", "samples.test", 2),
                ("admit", "samples.test", 2),
                ("admit", "samples.test", 1),
            ],
        )
        self.assertEqual(
            self._records(),
            [
                ("record", "samples.test", 2),
                ("record", "samples.test", 2),
                ("record", "samples.test", 1),
            ],
        )

    def test_insert_documents_does_not_write_a_refused_write(self):
        foo.register_insert_admitter(_Admitter(self.calls, refuse=True))

        coll = _FakeCollection("samples.test")

        with self.assertRaises(_Refused):
            foo.insert_documents(
                [{"_id": ObjectId()}],
                coll,
                batcher=False,
                progress=False,
            )

        self.assertEqual(coll.batch_sizes, [])
        self.assertEqual(self._records(), [])

    def test_a_failed_write_records_what_landed(self):
        foo.register_insert_admitter(_Admitter(self.calls))

        coll = _FakeCollection("samples.test", fail_after=1)

        with self.assertRaises(ValueError):
            foo.insert_documents(
                [{"_id": ObjectId()} for _ in range(3)],
                coll,
                batcher=False,
                progress=False,
            )

        self.assertEqual(self._records(), [("record", "samples.test", 1)])


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
