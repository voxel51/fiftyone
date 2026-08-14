"""
FiftyOne odm unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.fields as fof
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


class ConnectionBootstrapTests(unittest.TestCase):
    """Operations that mongoengine performs natively (querysets, lazy
    dereference of reference fields, GridFS reads) resolve the connection
    registry directly rather than passing through FiftyOne's lazy
    ``ensure_connection()`` checkpoints. The ``get_connection`` wrapper
    installed by ``fiftyone.core.odm.database`` must bootstrap the default
    connection for them.
    """

    def _disconnect(self):
        """Simulates a worker teardown (fiftyone.core.map.process,
        fiftyone.utils.torch) or a cold process.
        """
        import fiftyone.core.odm.database as fodb
        import fiftyone.factory.repo_factory as forf

        fodb._disconnect()

        # The repo factory caches the client, which is now closed; reset it
        # so that test cleanup can reconnect
        forf._db = None
        forf.RepositoryFactory.repos.clear()

    def test_wrapper_is_installed(self):
        import mongoengine
        from mongoengine import mongodb_support

        self.assertTrue(
            getattr(
                mongoengine.connection.get_connection,
                "_fiftyone_bootstrap",
                False,
            )
        )
        self.assertIs(
            mongodb_support.get_connection,
            mongoengine.connection.get_connection,
        )

    def test_bootstraps_default_connection(self):
        import mongoengine

        self._disconnect()

        conn = mongoengine.connection.get_connection()
        self.assertIsNotNone(conn)

    def test_non_default_alias_still_raises(self):
        import mongoengine
        from mongoengine.connection import ConnectionFailure

        with self.assertRaises(ConnectionFailure):
            mongoengine.connection.get_connection("no-such-alias")

    def test_queryset_after_disconnect(self):
        self._disconnect()

        # A direct queryset is the first DB access after teardown
        # pylint: disable-next=no-member
        foo.DatasetDocument.objects.first()

    def test_dereference_after_disconnect(self):
        dataset = fo.Dataset()

        try:
            config = dataset.init_run(foo="bar")
            dataset.register_run("test", config)

            results = dataset.init_run_results("test", spam="eggs")
            dataset.save_run_results("test", results, cache=False)

            # Reset the in-memory doc so the run references are raw DBRefs
            dataset.reload()

            self._disconnect()

            # Dereferencing run references + reading GridFS results are the
            # first DB accesses after teardown
            self.assertListEqual(dataset.list_runs(), ["test"])

            dataset.reload()
            self._disconnect()

            results = dataset.load_run_results("test", cache=False)
            self.assertEqual(results.spam, "eggs")
        finally:
            dataset.delete()


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
