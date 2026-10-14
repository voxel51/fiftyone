"""
FiftyOne odm unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from functools import partial
from unittest import mock
import uuid

import bson
from bson import ObjectId
from bson.binary import UuidRepresentation
from bson.codec_options import CodecOptions
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
        self.num_bytes = []

    def admit(self, collection_name, num_docs, num_bytes=None):
        if self.refuse:
            raise _Refused

        self.calls.append((self.tag, "admit", collection_name, num_docs))
        self.num_bytes.append(("admit", num_bytes))

    def record(self, collection_name, num_docs, num_bytes=None):
        self.calls.append((self.tag, "record", collection_name, num_docs))
        self.num_bytes.append(("record", num_bytes))


class _SizingAdmitter(_Admitter):
    """An admitter that asks for batches sized in bytes."""

    def wants_bytes(self):
        return True


class _IndistinctAdmitter(_Admitter):
    """An admitter that compares equal to every other."""

    def __eq__(self, other):
        return True

    __hash__ = object.__hash__


class _FakeCollection:
    """A pymongo collection stand-in that records what it was asked to
    write."""

    def __init__(
        self,
        name,
        fail_after=None,
        failed=None,
        codec_options=bson.DEFAULT_CODEC_OPTIONS,
    ):
        self.name = name
        self.batch_sizes = []
        self.fail_after = fail_after
        self.failed = failed
        self.codec_options = codec_options

    def insert_many(self, docs, ordered=False):
        self.batch_sizes.append(len(docs))
        if self.fail_after is not None:
            raise BulkWriteError(
                {
                    "nInserted": self.fail_after,
                    "writeErrors": [
                        {"index": self.fail_after, "errmsg": "duplicate key"}
                    ],
                }
            )

        if self.failed is not None:
            # an unordered write that went on past its failures
            raise BulkWriteError(
                {
                    "nInserted": len(docs) - len(self.failed),
                    "writeErrors": [
                        {"index": i, "errmsg": "duplicate key"}
                        for i in self.failed
                    ],
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

    def test_batches_are_sized_when_an_admitter_wants_bytes(self):
        admitter = _SizingAdmitter(self.calls)
        foo.register_insert_admitter(admitter)

        coll = _FakeCollection("samples.test")
        docs = [
            {"_id": ObjectId(), "filepath": f"/im{i}.png"} for i in range(3)
        ]
        num_bytes = sum(len(bson.encode(d)) for d in docs)

        foo.insert_documents(docs, coll, batcher=False, progress=False)

        # the up-front admission of the whole write is a count check only;
        # the batch itself is sized
        self.assertEqual(
            admitter.num_bytes,
            [("admit", None), ("admit", num_bytes), ("record", num_bytes)],
        )

    def test_every_admitter_sees_the_size_when_one_wants_bytes(self):
        plain = _Admitter(self.calls, tag="plain")
        foo.register_insert_admitter(plain)
        foo.register_insert_admitter(_SizingAdmitter(self.calls))

        docs = [{"_id": ObjectId()}]
        num_bytes = len(bson.encode(docs[0]))

        foo.database._admitted_write(
            "samples.test", 1, lambda: _inserted(docs), docs=docs
        )

        self.assertEqual(
            plain.num_bytes, [("admit", num_bytes), ("record", num_bytes)]
        )

    def test_batches_are_not_encoded_when_no_admitter_wants_bytes(self):
        admitter = _Admitter(self.calls)
        foo.register_insert_admitter(admitter)

        coll = _FakeCollection("samples.test")
        docs = [{"_id": ObjectId()} for _ in range(3)]

        with mock.patch.object(
            foo.database, "_encoded_sizes"
        ) as encoded_sizes:
            foo.insert_documents(docs, coll, batcher=False, progress=False)

        encoded_sizes.assert_not_called()
        self.assertEqual(
            admitter.num_bytes,
            [("admit", None), ("admit", None), ("record", None)],
        )

    def test_a_write_without_docs_is_admitted_unsized(self):
        admitter = _SizingAdmitter(self.calls)
        foo.register_insert_admitter(admitter)

        docs = [{"_id": ObjectId()}]

        foo.database._admitted_write(
            "samples.test", 1, lambda: _inserted(docs), docs=None
        )

        self.assertEqual(
            admitter.num_bytes, [("admit", None), ("record", None)]
        )

    def test_a_failed_ordered_write_records_the_bytes_of_its_prefix(self):
        admitter = _SizingAdmitter(self.calls)
        foo.register_insert_admitter(admitter)

        coll = _FakeCollection("samples.test", fail_after=1)
        docs = [
            {"_id": ObjectId(), "filepath": "/" + "x" * n} for n in (90, 5, 5)
        ]

        with self.assertRaises(ValueError):
            foo.insert_documents(
                docs, coll, ordered=True, batcher=False, progress=False
            )

        self.assertEqual(self._records(), [("record", "samples.test", 1)])
        self.assertEqual(
            admitter.num_bytes[-1], ("record", len(bson.encode(docs[0])))
        )

    def test_a_failed_unordered_write_records_the_bytes_that_landed(self):
        admitter = _SizingAdmitter(self.calls)
        foo.register_insert_admitter(admitter)

        # the large document in the middle fails; the ones around it land
        coll = _FakeCollection("samples.test", failed=[1])
        docs = [
            {"_id": ObjectId(), "filepath": "/" + "x" * n} for n in (5, 90, 5)
        ]

        with self.assertRaises(ValueError):
            foo.insert_documents(docs, coll, batcher=False, progress=False)

        self.assertEqual(self._records(), [("record", "samples.test", 2)])
        self.assertEqual(
            admitter.num_bytes[-1],
            ("record", len(bson.encode(docs[0])) + len(bson.encode(docs[2]))),
        )

    def test_a_document_without_an_id_is_sized_with_the_one_it_will_get(self):
        doc = {"filepath": "/im.png"}

        (size,) = foo.database._encoded_sizes([doc])

        self.assertNotIn("_id", doc)
        self.assertEqual(
            size, len(bson.encode({"_id": ObjectId(), "filepath": "/im.png"}))
        )

    def test_batches_are_sized_with_the_collection_codec_options(self):
        admitter = _SizingAdmitter(self.calls)
        foo.register_insert_admitter(admitter)

        # native UUIDs only encode under an explicit UUID representation
        codec_options = CodecOptions(
            uuid_representation=UuidRepresentation.STANDARD
        )
        coll = _FakeCollection("samples.test", codec_options=codec_options)
        docs = [{"_id": ObjectId(), "key": uuid.uuid4()}]

        foo.insert_documents(docs, coll, batcher=False, progress=False)

        num_bytes = len(bson.encode(docs[0], codec_options=codec_options))
        self.assertEqual(admitter.num_bytes[-1], ("record", num_bytes))


def _inserted(docs):
    return InsertManyResult([d["_id"] for d in docs], acknowledged=True)


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
