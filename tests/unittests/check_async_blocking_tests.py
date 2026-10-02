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

    def test_ignores_names_builtins_share(self):
        source = """
            async def get(request):
                params = request.query_params
                return {k: v for k, v in params.items()}, "a".count("a")
        """
        self.assertEqual(_calls(source), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
