"""
FiftyOne run-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import fiftyone as fo

from decorators import drop_datasets


class RunTests(unittest.TestCase):
    @drop_datasets
    def test_custom_run(self):
        dataset = fo.Dataset()

        self.assertFalse(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), [])

        config = dataset.init_run()
        config.foo = "bar"
        config.spam = "eggs"
        dataset.register_run("custom", config)

        results = dataset.init_run_results("custom")
        results.foo = "bar"
        results.spam = "eggs"
        dataset.save_run_results("custom", results)

        self.assertTrue(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), ["custom"])

        del config
        del results
        dataset.clear_cache()

        info = dataset.get_run_info("custom")
        config = info.config
        self.assertEqual(config.foo, "bar")
        self.assertEqual(config.spam, "eggs")

        delattr(config, "spam")
        config.foo = "eggs"

        dataset.update_run_config("custom", config)

        del config
        dataset.clear_cache()

        info = dataset.get_run_info("custom")
        config = info.config
        self.assertEqual(config.foo, "eggs")
        with self.assertRaises(AttributeError):
            _ = config.spam

        results = dataset.load_run_results("custom")
        self.assertEqual(results.foo, "bar")
        self.assertEqual(results.spam, "eggs")

        delattr(results, "spam")
        results.foo = "eggs"

        with self.assertRaises(ValueError):
            dataset.save_run_results("custom", results, overwrite=False)

        dataset.save_run_results("custom", results, overwrite=True)

        del results
        dataset.clear_cache()

        results = dataset.load_run_results("custom")
        self.assertEqual(results.foo, "eggs")
        with self.assertRaises(AttributeError):
            _ = results.spam

        dataset2 = dataset.clone()

        self.assertTrue(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), ["custom"])

        dataset.delete_run("custom")

        self.assertFalse(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), [])

        dataset2.rename_run("custom", "still_custom")
        dataset2.clear_cache()

        self.assertTrue(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), ["still_custom"])

        info = dataset2.get_run_info("still_custom")
        results = dataset2.load_run_results("still_custom")

        dataset2.delete_runs()

        self.assertFalse(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), [])

    @drop_datasets
    def test_custom_run_kwargs(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config1 = dataset.init_run(**kwargs)
        dataset.register_run("custom1", config1)

        results1 = dataset.init_run_results("custom1", **kwargs)
        dataset.save_run_results("custom1", results1)

        config2 = dataset.init_run(method="test", **kwargs)
        dataset.register_run("custom2", config2)

        results2 = dataset.init_run_results("custom2", **kwargs)
        dataset.save_run_results("custom2", results2)

        runs = dataset.list_runs()
        self.assertListEqual(runs, ["custom1", "custom2"])

        info1 = dataset.get_run_info("custom1")
        self.assertEqual(info1.config.method, None)

        info2 = dataset.get_run_info("custom2")
        self.assertEqual(info2.config.method, "test")

        runs = dataset.list_runs(method="test")
        self.assertListEqual(runs, ["custom2"])

    @drop_datasets
    def test_concurrent_run_updates(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config1 = dataset.init_run(**kwargs)
        dataset.register_run("custom1", config1)

        results1 = dataset.init_run_results("custom1", **kwargs)
        dataset.save_run_results("custom1", results1)

        # Don't reuse singleton; we want to test concurrent edits here
        dataset._instances.pop(dataset.name)
        also_dataset = fo.load_dataset(dataset.name)
        self.assertIsNot(dataset, also_dataset)

        config2 = also_dataset.init_run(**kwargs)
        also_dataset.register_run("custom2", config2)

        results2 = also_dataset.init_run_results("custom2", **kwargs)
        also_dataset.save_run_results("custom2", results2)

        self.assertListEqual(dataset.list_runs(), ["custom1"])

        dataset.rename_run("custom1", "still_custom1")
        also_dataset.reload()

        self.assertListEqual(
            also_dataset.list_runs(),
            ["custom2", "still_custom1"],
        )

        dataset.delete_run("still_custom1")
        also_dataset.reload()

        self.assertListEqual(also_dataset.list_runs(), ["custom2"])

        dataset.reload()

        self.assertListEqual(dataset.list_runs(), ["custom2"])

    @drop_datasets
    def test_run_timestamps(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config = dataset.init_run(**kwargs)
        dataset.register_run("test", config)

        results = dataset.init_run_results("test", **kwargs)
        dataset.save_run_results("test", results)

        # Cloning should bump timestamps
        dataset2 = dataset.clone()

        run_info1 = dataset.get_run_info("test")
        run_info2 = dataset2.get_run_info("test")

        self.assertTrue(run_info1.timestamp < run_info2.timestamp)


class ReferenceConnectionBootstrapTests(unittest.TestCase):
    """Accessing a dataset document's references (runs, saved views,
    workspaces) must bootstrap the DB connection before dereferencing — the
    access may occur in a process without an established connection (e.g. a
    cold process in API mode, or a worker that disconnected), and
    mongoengine's dereference machinery does not establish the default
    connection on its own.
    """

    @classmethod
    def _field_classes(cls):
        import fiftyone.core.fields as fof
        import fiftyone.core.odm.dataset as food

        return (
            (food._ConnectedReferencesDictField, fof.DictField),
            (food._ConnectedReferencesListField, fof.ListField),
        )

    def test_connected_fields_bootstrap_connection_first(self):
        import fiftyone.core.odm.dataset as food

        for field_cls, base_cls in self._field_classes():
            manager = mock.Mock()
            field = field_cls()

            with (
                mock.patch.object(
                    food, "ensure_connection", manager.ensure_connection
                ),
                mock.patch.object(
                    base_cls, "__get__", manager.super_get, create=True
                ),
            ):
                field_cls.__get__(field, object(), object)

            calls = [name for name, _, _ in manager.mock_calls]
            self.assertIn("super_get", calls)
            self.assertEqual(
                calls[0],
                "ensure_connection",
                f"connection must be established before dereferencing; got {calls}",
            )

    def test_connected_fields_skip_class_access(self):
        import fiftyone.core.odm.dataset as food

        for field_cls, base_cls in self._field_classes():
            manager = mock.Mock()
            field = field_cls()

            with (
                mock.patch.object(
                    food, "ensure_connection", manager.ensure_connection
                ),
                mock.patch.object(
                    base_cls, "__get__", manager.super_get, create=True
                ),
            ):
                field_cls.__get__(field, None, object)

            calls = [name for name, _, _ in manager.mock_calls]
            self.assertNotIn("ensure_connection", calls)

    def test_dataset_reference_fields_use_connected_fields(self):
        import fiftyone.core.odm.dataset as food

        # pylint: disable=no-member
        fields = food.DatasetDocument._fields

        for name in (
            "annotation_runs",
            "brain_methods",
            "evaluations",
            "runs",
        ):
            self.assertIsInstance(
                fields[name], food._ConnectedReferencesDictField, name
            )

        for name in ("saved_views", "workspaces"):
            self.assertIsInstance(
                fields[name], food._ConnectedReferencesListField, name
            )

    def _disconnect(self):
        """Simulates a worker teardown (fiftyone.core.map.process,
        fiftyone.utils.torch).
        """
        import fiftyone.core.odm.database as fodb
        import fiftyone.factory.repo_factory as forf

        fodb._disconnect()

        # The repo factory caches the client, which is now closed; reset it
        # so that test cleanup can reconnect
        forf._db = None
        forf.RepositoryFactory.repos.clear()

    @drop_datasets
    def test_run_access_after_disconnect(self):
        dataset = fo.Dataset()

        config = dataset.init_run(foo="bar")
        dataset.register_run("test", config)

        results = dataset.init_run_results("test", spam="eggs")
        dataset.save_run_results("test", results, cache=False)

        # Reset the in-memory doc so the run references are raw DBRefs again
        dataset.reload()

        self._disconnect()

        self.assertListEqual(dataset.list_runs(), ["test"])

        results = dataset.load_run_results("test", cache=False)
        self.assertEqual(results.spam, "eggs")

    @drop_datasets
    def test_saved_view_access_after_disconnect(self):
        dataset = fo.Dataset()
        dataset.save_view("test", dataset.limit(1))

        dataset.reload()
        self._disconnect()

        self.assertListEqual(dataset.list_saved_views(), ["test"])
        dataset.load_saved_view("test")

    @drop_datasets
    def test_workspace_access_after_disconnect(self):
        dataset = fo.Dataset()
        dataset.save_workspace("test", fo.Space())

        dataset.reload()
        self._disconnect()

        self.assertListEqual(dataset.list_workspaces(), ["test"])
        dataset.load_workspace("test")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
