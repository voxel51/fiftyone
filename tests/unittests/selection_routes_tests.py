"""Async boundaries and request context for selection and subset routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import json
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

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

    async def call(
        self, endpoint, method="post", data=None, query="", receive=None
    ):
        async def connected():
            await asyncio.Future()

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
            },
            receive=receive or connected,
        )
        args = (data or {},) if method == "post" else ()
        return await getattr(endpoint, method).__wrapped__(
            endpoint.__new__(endpoint), request, *args
        )

    async def test_navigation_hydrates_nodes_in_cursor_order(self):
        ids = ["second", "first"]
        nodes = {
            sample_id: routes.foses.ImageSample(
                id=sample_id,
                sample={"_id": sample_id},
                urls=[],
                aspect_ratio=1,
            )
            for sample_id in reversed(ids)
        }
        result = {"kind": "seek", "ids": ids, "previous": None, "next": None}
        with patch.object(
            routes.fosn,
            "sample_neighborhood",
            return_value=(self.dataset, result),
        ), patch.object(
            routes.foses,
            "sample_nodes_for_ids",
            new=AsyncMock(return_value=nodes),
        ):
            response = await self.call(
                routes.SelectionNavigation, data={"sampleId": "second"}
            )
        self.assertEqual([node["id"] for node in response["nodes"]], ids)
        self.assertEqual(response["nodes"][0]["__typename"], "ImageSample")
        self.assertEqual(response["nodes"][0]["aspectRatio"], 1)

    async def test_navigation_timeout_is_retryable_not_a_missing_sample(self):
        from pymongo.errors import ExecutionTimeout

        with patch.object(
            routes.fosn,
            "sample_neighborhood",
            side_effect=ExecutionTimeout("deadline"),
        ):
            with self.assertRaises(HTTPException) as caught:
                await self.call(routes.SelectionNavigation)
        self.assertEqual(caught.exception.status_code, 408)

    async def test_navigation_queue_has_a_deadline(self):
        with patch.object(
            routes, "_navigation_workers", asyncio.Semaphore(0)
        ), patch.object(routes.fosn, "QUERY_SECONDS", 0.01), patch.object(
            routes.fosn, "sample_neighborhood"
        ) as locate:
            with self.assertRaises(HTTPException) as caught:
                await self.call(routes.SelectionNavigation)
        self.assertEqual(caught.exception.status_code, 408)
        locate.assert_not_called()

    async def test_disconnected_navigation_skips_work_when_a_slot_opens(self):
        workers = asyncio.Semaphore(0)

        async def receive():
            return {"type": "http.disconnect"}

        with patch.object(
            routes, "_navigation_workers", workers
        ), patch.object(routes.fosn, "sample_neighborhood") as locate:
            task = asyncio.create_task(
                self.call(routes.SelectionNavigation, receive=receive)
            )
            await asyncio.sleep(0)
            workers.release()
            response = await task
            self.assertEqual(response.status_code, 499)
            locate.assert_not_called()
            await asyncio.wait_for(workers.acquire(), timeout=1)

    async def test_disconnection_after_lookup_skips_hydration(self):
        completed = threading.Event()

        def locate(*args):
            completed.set()
            return self.dataset, {"kind": "seek", "ids": ["sample"]}

        async def receive():
            if completed.is_set():
                return {"type": "http.disconnect"}
            await asyncio.Future()

        with patch.object(
            routes.fosn, "sample_neighborhood", side_effect=locate
        ), patch.object(
            routes.foses, "sample_nodes_for_ids", new=AsyncMock()
        ) as hydrate:
            response = await self.call(
                routes.SelectionNavigation, receive=receive
            )
        self.assertEqual(response.status_code, 499)
        hydrate.assert_not_called()

    async def test_node_hydration_does_not_hold_a_lookup_slot(self):
        hydrating = asyncio.Event()
        finish = asyncio.Event()

        async def hydrate(*args, **kwargs):
            hydrating.set()
            await finish.wait()
            return {}

        with patch.object(
            routes, "_navigation_workers", asyncio.Semaphore(1)
        ), patch.object(
            routes.fosn,
            "sample_neighborhood",
            side_effect=[
                (self.dataset, {"kind": "seek", "ids": []}),
                (self.dataset, {"kind": "offset", "index": 1}),
            ],
        ), patch.object(
            routes.foses, "sample_nodes_for_ids", side_effect=hydrate
        ):
            first = asyncio.create_task(self.call(routes.SelectionNavigation))
            try:
                await asyncio.wait_for(hydrating.wait(), timeout=1)
                second = await asyncio.wait_for(
                    self.call(routes.SelectionNavigation), timeout=1
                )
                self.assertEqual(second, {"kind": "offset", "index": 1})
            finally:
                finish.set()
                await first

    async def test_cancelled_request_keeps_its_running_worker_slot(self):
        started = asyncio.Event()
        finish = threading.Event()
        loop = asyncio.get_running_loop()
        workers = asyncio.Semaphore(1)

        def locate(*args):
            loop.call_soon_threadsafe(started.set)
            finish.wait(timeout=2)
            return self.dataset, {"kind": "offset", "index": 1}

        with patch.object(
            routes, "_navigation_workers", workers
        ), patch.object(
            routes.fosn, "sample_neighborhood", side_effect=locate
        ):
            request = asyncio.create_task(
                self.call(routes.SelectionNavigation)
            )
            try:
                await asyncio.wait_for(started.wait(), timeout=1)
                request.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await request
                self.assertTrue(workers.locked())
            finally:
                finish.set()
                await asyncio.wait_for(workers.acquire(), timeout=1)

    async def test_subset_creation_forwards_optional_metadata(self):
        provenance = {"agent": "curation-agent"}
        lineage = {"subset_ids": ["parent"]}
        with patch.object(
            routes.fosub, "create_subset", return_value={}
        ) as create:
            await self.call(
                routes.Subsets,
                data={
                    "name": "Review",
                    "provenance": provenance,
                    "lineage": lineage,
                },
            )
        create.assert_called_once_with(
            self.dataset, "Review", None, None, None, provenance, lineage
        )

    async def test_subset_edit_updates_metadata_in_the_actor_worker(self):
        info = {"name": "Reviewed", "description": None}
        summary = {"id": "subset", **info}

        def update(dataset, subset_id, changes):
            self.assert_worker()
            self.assertIs(dataset, self.dataset)
            self.assertEqual(subset_id, "subset")
            self.assertEqual(changes, info)

        def read(dataset, subset_id):
            self.assert_worker()
            self.assertIs(dataset, self.dataset)
            self.assertEqual(subset_id, "subset")
            return summary

        with patch.object(
            routes.fosub, "update_subset_info", side_effect=update
        ) as write, patch.object(
            routes.fosub, "subset_summary", side_effect=read
        ):
            self.assertEqual(
                await self.call(routes.Subset, data=info), summary
            )
        write.assert_called_once()

    async def test_subset_edit_maps_access_and_validation_errors(self):
        for error, status in (
            (PermissionError("Denied"), 403),
            (ValueError("Invalid subset name"), 400),
            (routes.InvalidId("Invalid subset ID"), 400),
        ):
            with self.subTest(error=error):
                with patch.object(
                    routes.fosub, "update_subset_info", side_effect=error
                ), patch.object(routes.fosub, "subset_summary") as read:
                    with self.assertRaises(HTTPException) as caught:
                        await self.call(routes.Subset, data={"name": "Edit"})
                self.assertEqual(caught.exception.status_code, status)
                read.assert_not_called()

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

    async def test_tag_errors_preserve_messages_and_identify_lost_captures(
        self,
    ):
        for error, code in (
            (
                routes.foss.SelectionCaptureUnavailableError(
                    "Capture expired"
                ),
                410,
            ),
            (PermissionError("Cannot tag this dataset"), 403),
            (ValueError("Invalid tag"), 400),
        ):
            with self.subTest(code=code), patch.object(
                routes.foss, "tag_captured_members", side_effect=error
            ):
                response = await self.call(routes.SelectionTags)
            self.assertEqual(response.status_code, code)
            self.assertEqual(
                json.loads(response.body), {"message": str(error)}
            )

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

        async def nodes(dataset, ids):
            self.assertEqual(threading.get_ident(), self.loop_thread)
            self.assertEqual(ids, ["present"])
            return {}

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

    async def test_availability_supplies_grid_nodes_for_present_samples(self):
        node = routes.foses.ThreeDSample(
            id="scene",
            sample={"_id": "scene", "filepath": "/scene.fo3d"},
            urls=[routes.foses.MediaURL(field="filepath", url="/scene.fo3d")],
            aspect_ratio=1,
        )
        image = routes.foses.ImageSample(
            id="image",
            sample={"_id": "image", "filepath": "gs://bucket/image.jpg"},
            urls=[
                routes.foses.MediaURL(
                    field="filepath",
                    url="https://media.example/image.jpg?signed=1",
                )
            ],
            aspect_ratio=2,
        )
        for media_type in (
            "image",
            "video",
            "3d",
            "point-cloud",
            "group",
            "multimodal",
        ):
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
                    return_value={"scene": node, "image": image},
                ) as read:
                    result = await self.call(
                        routes.SelectionAvailability,
                        data={"episodeIds": list(details)},
                    )
                read.assert_awaited_once_with(
                    self.dataset, ["scene", "cloud", "image"]
                )
                self.assertEqual(result["scene"]["node"]["aspectRatio"], 1)
                self.assertEqual(
                    result["scene"]["node"]["sample"], node.sample
                )
                self.assertEqual(
                    result["image"]["node"]["urls"][0]["url"],
                    image.urls[0].url,
                )
                self.assertNotIn("node", result["missing"])

    async def test_availability_resolves_generated_media_in_its_own_dataset(
        self,
    ):
        stages = [{"_cls": "fiftyone.core.stages.ToPatches"}]
        generated = object()
        node = routes.foses.ImageSample(
            id="patch",
            sample={"_id": "patch", "filepath": "gs://bucket/source.jpg"},
            urls=[
                routes.foses.MediaURL(
                    field="filepath",
                    url="https://media.example/source.jpg?signed=1",
                )
            ],
            aspect_ratio=2,
        )
        crop = [0.1, 0.2, 0.3, 0.4]
        with patch.object(
            routes.foss,
            "selection_availability",
            return_value={
                "patch": {"filepath": "gs://bucket/source.jpg", "crop": crop}
            },
        ), patch.object(
            routes.foss, "view_dataset", return_value=generated
        ), patch.object(
            routes.foses, "sample_nodes_for_ids", return_value={"patch": node}
        ) as read:
            result = await self.call(
                routes.SelectionAvailability,
                data={"episodeIds": ["patch"], "view": stages},
            )
        read.assert_awaited_once_with(generated, ["patch"])
        self.assertEqual(result["patch"]["crop"], crop)
        self.assertEqual(
            result["patch"]["node"]["urls"][0]["url"], node.urls[0].url
        )

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
