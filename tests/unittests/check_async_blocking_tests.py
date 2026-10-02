"""
Tests for ``tools/check_async_blocking.py``.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib.util
import pathlib
import textwrap
import unittest

_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "tools"
    / "check_async_blocking.py"
)
_spec = importlib.util.spec_from_file_location("check_async_blocking", _PATH)
cab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cab)


def _calls(source):
    return [
        (function, call)
        for function, call, _ in cab.find_blocking_calls(
            textwrap.dedent(source)
        )
    ]


class CheckAsyncBlockingTests(unittest.TestCase):
    def test_flags_blocking_calls_inside_async_functions(self):
        source = """
            async def patch(request):
                dataset = fo.load_dataset("d")
                sample = dataset.first()
                sample.save()
                time.sleep(1)
        """
        self.assertEqual(
            _calls(source),
            [
                ("patch", "load_dataset"),
                ("patch", "first"),
                ("patch", "save"),
                ("patch", "time.sleep"),
            ],
        )

    def test_ignores_sync_functions(self):
        source = """
            def save_it(sample):
                sample.save()
        """
        self.assertEqual(_calls(source), [])

    def test_allows_awaited_calls_and_async_iteration(self):
        source = """
            async def load(collection):
                docs = await foo.aggregate(collection, []).to_list(None)
                await sample.save()
                async for doc in collection.find({}):
                    pass
        """
        self.assertEqual(_calls(source), [])

    def test_allows_work_handed_to_run_sync_task(self):
        source = """
            async def post(request):
                def apply():
                    sample.save()

                await run_sync_task(apply)
                await run_sync_task(lambda: dataset.reload())
        """
        self.assertEqual(_calls(source), [])

    def test_follows_blocking_helpers_in_the_same_module(self):
        source = """
            def save_sample(sample):
                sample.save()

            def finish(sample):
                return save_sample(sample)

            class Route:
                def _load(self):
                    return fo.load_dataset("d")

                async def patch(self, request):
                    finish(None)
                    self._load()
                    await run_sync_task(finish, None)
        """
        self.assertEqual(
            _calls(source), [("patch", "finish"), ("patch", "_load")]
        )

    def test_flags_eager_arguments_of_awaited_calls(self):
        source = """
            async def post(request):
                await run_sync_task(fo.load_dataset("d"))
                async for doc in stream(dataset.first()):
                    pass
        """
        self.assertEqual(
            _calls(source), [("post", "load_dataset"), ("post", "first")]
        )

    def test_flags_blocking_receivers_of_awaited_chains(self):
        source = """
            async def get(request):
                await dataset.first().to_dict_async()
                docs = await collection.find({}).sort("a").to_list(None)
        """
        self.assertEqual(_calls(source), [("get", "first")])

    def test_flags_nested_function_defaults_and_decorators(self):
        source = """
            async def post(request):
                @cache(dataset.reload())
                def work(value=sample.save()):
                    sample.save()

                await run_sync_task(lambda value=dataset.first(): value)
        """
        self.assertEqual(
            _calls(source),
            [("post", "reload"), ("post", "save"), ("post", "first")],
        )

    def test_resolves_helpers_within_their_class(self):
        source = """
            class A:
                def _load(self):
                    return fo.load_dataset("d")

                async def get(self, request):
                    self._load()

            class B:
                def _load(self):
                    return None

                async def get(self, request):
                    self._load()
        """
        self.assertEqual(_calls(source), [("get", "_load")])

    def test_ignores_helpers_that_only_define_blocking_work(self):
        source = """
            def make_saver(sample):
                def save():
                    sample.save()

                return save

            async def post(request):
                saver = make_saver(None)
                await run_sync_task(saver)
        """
        self.assertEqual(_calls(source), [])

    def test_local_bindings_shadow_module_helpers(self):
        source = """
            def save_sample(sample):
                sample.save()

            async def patch(request, save_sample=None):
                save_sample(None)

            async def post(request):
                save_sample = lambda sample: None
                save_sample(None)
        """
        self.assertEqual(_calls(source), [])

    def test_follows_class_qualified_helpers(self):
        source = """
            class Route:
                @staticmethod
                def _load():
                    return fo.load_dataset("d")

                async def get(self, request):
                    Route._load()
        """
        self.assertEqual(_calls(source), [("get", "_load")])

    def test_ignores_a_helpers_own_defaults(self):
        source = """
            def helper(dataset=fo.load_dataset("d")):
                return dataset

            async def get(request):
                helper()
        """
        self.assertEqual(_calls(source), [])

    def test_follows_nested_functions_a_helper_calls(self):
        source = """
            def helper(sample):
                def save():
                    sample.save()

                save()

            async def post(request):
                helper(None)
        """
        self.assertEqual(_calls(source), [("post", "helper")])

    def test_flags_querying_a_held_view(self):
        source = """
            async def post(request):
                view = await fosv.get_view("d", stages=[])
                view = view.match({})
                n = len(view)
                if view:
                    pass
                for sample in view:
                    pass
                ids = [s.id for s in view]
                found = "a" in view
                first = view["a"]
                result = view.aggregate([])
                count = view.count()
                await view._async_aggregate([])
        """
        self.assertEqual(
            [c for _, c in _calls(source)],
            [
                "len(view)",
                "truth-testing view",
                "iterating view",
                "iterating view",
                "membership in view",
                "indexing view",
                "view.aggregate",
                "view.count",
            ],
        )

    def test_view_tracking_ignores_other_values(self):
        source = """
            async def get(request):
                m = re.match("a", "b")
                if m:
                    pass
                rows = await collection.find({}).to_list(None)
                return len(rows), [r for r in rows], rows[0]
        """
        self.assertEqual(_calls(source), [])

    def test_a_reassigned_name_stops_being_a_view(self):
        source = """
            async def get(request):
                view = fo.load_dataset("d")
                view = view.values("id")
                return len(view)
        """
        self.assertEqual(
            [c for _, c in _calls(source)], ["load_dataset", "view.values"]
        )

    def test_helpers_that_query_a_view_block(self):
        source = """
            def size(name):
                dataset = get_dataset(name)
                return dataset.count()

            async def get(request):
                size("d")
        """
        self.assertEqual(_calls(source), [("get", "size")])

    def test_ignores_names_builtins_share(self):
        source = """
            async def get(request):
                params = request.query_params
                return {k: v for k, v in params.items()}, "a".count("a")
        """
        self.assertEqual(_calls(source), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
