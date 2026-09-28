"""Async boundaries and request context for selection and subset routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from starlette.exceptions import HTTPException
from starlette.requests import Request

from contextvars import ContextVar

import fiftyone.core.selection_context as fosc

_actor = ContextVar("selection_test_actor", default=None)
import fiftyone.server.routes.selection as routes


class SelectionRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        actor_provider = patch.object(fosc, "get_actor", _actor.get)
        actor_provider.start()
        self.addCleanup(actor_provider.stop)
        self.loop_thread = threading.get_ident()
        self.dataset = SimpleNamespace(media_type="image")
        self.load = patch.object(
            routes, "get_dataset", side_effect=self.load_dataset
        )
        self.load.start()
        self.addCleanup(self.load.stop)

    async def asyncSetUp(self):
        self.actor = _actor.set("selection-route-owner")

    async def asyncTearDown(self):
        _actor.reset(self.actor)

    def assert_worker(self):
        self.assertNotEqual(threading.get_ident(), self.loop_thread)
        self.assertEqual(_actor.get(), "selection-route-owner")

    def load_dataset(self, identifier):
        self.assert_worker()
        self.assertEqual(identifier, "dataset")
        return self.dataset

    async def call(self, endpoint, method="post", data=None, query=""):
        request = Request(
            {
                "type": "http",
                "method": method.upper(),
                "path": "/dataset/dataset",
                "path_params": {
                    "dataset_id": "dataset",
                    "subset_id": "subset",
                    "job_id": "job",
                },
                "query_string": query.encode(),
                "headers": [],
            }
        )
        args = (data or {},) if method == "post" else ()
        return await getattr(endpoint, method).__wrapped__(
            endpoint.__new__(endpoint), request, *args
        )

    async def test_sync_routes_offload_dataset_loading_and_operations(self):
        cases = [
            (
                routes.SelectionCandidates,
                "post",
                routes.foss,
                "resolve_scope",
                {},
            ),
            (
                routes.SelectionCandidates,
                "get",
                routes.foss,
                "provider_options",
                {},
            ),
            (
                routes.SelectionSnapshots,
                "post",
                routes.foss,
                "create_snapshot",
                {},
            ),
            (
                routes.SelectionSnapshots,
                "get",
                routes.foss,
                "provider_options",
                {},
            ),
            (
                routes.SelectionPosition,
                "post",
                routes.foss,
                "sample_position",
                {},
            ),
            (routes.Subsets, "post", routes.fosub, "create_subset", {}),
            (routes.Subset, "get", routes.fosub, "subset_summary", {}),
            (routes.Subset, "delete", routes.fosub, "delete_subset", {}),
            (
                routes.SubsetAdd,
                "post",
                routes.foss,
                "prepare_subset_add",
                {"phase": "prepare"},
            ),
            (
                routes.SubsetAdd,
                "post",
                routes.fosub,
                "apply_add",
                {"phase": "apply", "operationId": "operation"},
            ),
            (routes.SelectionJobs, "post", routes.fosj, "start_job", {}),
            (routes.SelectionJob, "get", routes.fosj, "get_job", {}),
            (
                routes.SelectionJob,
                "post",
                routes.fosj,
                "cancel_job",
                {"action": "cancel"},
            ),
            (
                routes.SelectionJob,
                "post",
                routes.fosj,
                "retry_job",
                {"action": "retry"},
            ),
        ]

        def operation(dataset, *args):
            self.assert_worker()
            self.assertIs(dataset, self.dataset)
            return {"completed": True}

        for endpoint, method, module, name, data in cases:
            with self.subTest(endpoint=endpoint.__name__, action=name):
                with patch.object(module, name, side_effect=operation):
                    result = await self.call(
                        endpoint, method, data, query="counts=true"
                    )
                self.assertEqual(result, {"completed": True})

    async def test_capture_actions_run_in_a_worker(self):
        def mutate(dataset, *args):
            self.assert_worker()
            self.assertIs(dataset, self.dataset)
            return {"completed": True}

        for endpoint, name in (
            (routes.SelectionTags, "tag_captured_members"),
            (routes.SubsetRemove, "remove_captured_members"),
        ):
            with self.subTest(endpoint=endpoint.__name__):
                with patch.object(routes.foss, name, side_effect=mutate):
                    self.assertEqual(
                        await self.call(endpoint), {"completed": True}
                    )

    async def test_metadata_queries_stay_async_after_dataset_loading(self):
        async def metadata(dataset, *args):
            self.assertEqual(threading.get_ident(), self.loop_thread)
            self.assertEqual(_actor.get(), "selection-route-owner")
            self.assertIs(dataset, self.dataset)
            return {"memberCount": 4}

        for endpoint, name in (
            (routes.Subsets, "async_browse_subsets"),
            (routes.Subset, "async_subset_summary"),
        ):
            with self.subTest(endpoint=endpoint.__name__):
                with patch.object(
                    routes.fosub, name, side_effect=metadata
                ) as read:
                    result = await self.call(endpoint, "get")
                read.assert_awaited_once()
                self.assertEqual(result, {"memberCount": 4})

    async def test_availability_rejects_malformed_ids_and_maps_access_denial(
        self,
    ):
        for value in (None, "sample-id", {"id": "sample-id"}):
            with self.assertRaises(HTTPException) as caught:
                await self.call(
                    routes.SelectionAvailability, data={"episodeIds": value}
                )
            self.assertEqual(caught.exception.status_code, 400)
        with patch.object(
            routes.foss,
            "selection_availability",
            side_effect=PermissionError("Denied"),
        ):
            with self.assertRaises(HTTPException) as caught:
                await self.call(
                    routes.SelectionAvailability, data={"episodeIds": []}
                )
            self.assertEqual(caught.exception.status_code, 403)

    async def test_availability_keeps_sync_metadata_outside_the_event_loop(
        self,
    ):
        result = {
            "present": {"unavailable": False},
            "missing": {"unavailable": True},
        }

        def availability(dataset, *args):
            self.assert_worker()
            return result

        def references():
            self.assert_worker()
            return True

        async def nodes(dataset, ids):
            self.assertEqual(threading.get_ident(), self.loop_thread)
            self.assertEqual(ids, ["present"])
            return {}

        self.dataset._contains_media_references = references
        with patch.object(
            routes.foss, "selection_availability", side_effect=availability
        ), patch.object(
            routes.foses, "sample_nodes_for_ids", side_effect=nodes
        ) as read:
            actual = await self.call(
                routes.SelectionAvailability,
                data={"episodeIds": ["present", "missing"]},
            )
        read.assert_awaited_once()
        self.assertEqual(actual, result)

    async def test_availability_supplies_grid_nodes_for_3d_samples(self):
        self.dataset._contains_media_references = lambda: False
        node = routes.foses.ThreeDSample(
            id="scene",
            sample={"_id": "scene", "filepath": "/scene.fo3d"},
            urls=[routes.foses.MediaURL(field="filepath", url="/scene.fo3d")],
            aspect_ratio=1,
        )
        for media_type in ("3d", "point-cloud", "group"):
            with self.subTest(media_type=media_type):
                self.dataset.media_type = media_type
                details = {
                    "scene": {"filepath": "/scene.fo3d"},
                    "cloud": {"filepath": "/cloud.pcd"},
                    "image": {"filepath": "/image.jpg"},
                    "missing": {
                        "filepath": "/missing.fo3d",
                        "unavailable": True,
                    },
                }
                with patch.object(
                    routes.foss, "selection_availability", return_value=details
                ), patch.object(
                    routes.foses,
                    "sample_nodes_for_ids",
                    return_value={"scene": node},
                ) as read:
                    result = await self.call(
                        routes.SelectionAvailability,
                        data={"episodeIds": list(details)},
                    )
                read.assert_awaited_once_with(self.dataset, ["scene", "cloud"])
                self.assertEqual(result["scene"]["node"]["aspectRatio"], 1)
                self.assertEqual(
                    result["scene"]["node"]["sample"], node.sample
                )
                self.assertNotIn("node", result["image"])
                self.assertNotIn("node", result["missing"])

    async def test_availability_skips_grid_nodes_for_generated_samples(self):
        self.dataset._contains_media_references = lambda: False
        stages = [{"_cls": "fiftyone.core.stages.ToPatches"}]
        with patch.object(
            routes.foss,
            "selection_availability",
            return_value={"patch": {"filepath": "/scene.fo3d"}},
        ), patch.object(
            routes.foss, "view_dataset", return_value=object()
        ), patch.object(
            routes.foses, "sample_nodes_for_ids"
        ) as read:
            await self.call(
                routes.SelectionAvailability,
                data={"episodeIds": ["patch"], "view": stages},
            )
        read.assert_not_awaited()

    async def test_dataset_permission_errors_keep_their_http_status(self):
        def denied(identifier):
            self.assert_worker()
            raise PermissionError("No access to this dataset")

        with patch.object(routes, "get_dataset", side_effect=denied):
            for endpoint in (routes.Subsets, routes.SelectionJobs):
                with self.subTest(endpoint=endpoint.__name__):
                    with self.assertRaises(HTTPException) as error:
                        await self.call(endpoint)
                    self.assertEqual(error.exception.status_code, 403)

    async def test_concurrent_requests_preserve_separate_actor_contexts(self):
        barrier = threading.Barrier(2, timeout=5)

        def load(identifier):
            self.assertNotEqual(threading.get_ident(), self.loop_thread)
            actor = _actor.get()
            barrier.wait()
            self.assertEqual(_actor.get(), actor)
            return actor

        async def request(actor):
            token = _actor.set(actor)
            try:
                return await self.call(routes.SelectionJobs)
            finally:
                _actor.reset(token)

        def start(actor, data):
            self.assertEqual(_actor.get(), actor)
            return actor

        with patch.object(
            routes, "get_dataset", side_effect=load
        ), patch.object(routes.fosj, "start_job", side_effect=start):
            result = await asyncio.gather(request("first"), request("second"))
        self.assertEqual(result, ["first", "second"])
        self.assertEqual(_actor.get(), "selection-route-owner")
