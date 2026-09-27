"""Selection provider registration and local fallbacks.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from contextvars import ContextVar, copy_context
import unittest
from unittest.mock import AsyncMock, patch

import fiftyone.core.selection_context as context
import fiftyone.server.selection_extensions as extensions


class SelectionContextTests(unittest.TestCase):
    def test_actor_is_read_in_the_request_context(self):
        actor = ContextVar("actor", default=None)
        access = lambda dataset, action: None
        unregister = context.register_selection_context(actor.get, access)
        self.addCleanup(unregister)
        token = actor.set("captured")
        captured = copy_context()
        actor.reset(token)
        self.assertIsNone(context.get_actor())
        self.assertEqual(captured.run(context.get_actor), "captured")

    def test_access_denial_propagates_and_disposal_restores_policy(self):
        def deny(dataset, action):
            raise PermissionError(action)

        old = context.get_actor()
        unregister = context.register_selection_context(lambda: "actor", deny)
        try:
            with self.assertRaisesRegex(PermissionError, "edit"):
                context.check_access(object(), "edit")
        finally:
            unregister()
        self.assertEqual(context.get_actor(), old)


class SelectionFilterTests(unittest.TestCase):
    def setUp(self):
        resolver = patch.object(extensions, "_filter_resolver", None)
        resolver.start()
        self.addCleanup(resolver.stop)

    def test_local_filters_and_view_are_unchanged(self):
        filters, apply = extensions.resolve_filters(None, {"field": "value"})
        self.assertEqual(filters, {"field": "value"})
        view = object()
        self.assertIs(apply(view), view)

    def test_provider_keeps_empty_candidates_and_propagates_errors(self):
        unregister = extensions.register_selection_filter_resolver(
            lambda dataset, filters: ({}, lambda view: [])
        )
        try:
            filters, apply = extensions.resolve_filters(
                None, {"provider": True}
            )
            self.assertEqual(filters, {})
            self.assertEqual(apply(["sample"]), [])
        finally:
            unregister()

        def fail(dataset, filters):
            raise ValueError("Unavailable selection source")

        unregister = extensions.register_selection_filter_resolver(fail)
        try:
            with self.assertRaisesRegex(ValueError, "Unavailable"):
                extensions.resolve_filters(None, {})
        finally:
            unregister()


class SelectionPreviewTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        builder = patch.object(extensions, "_sample_builder", None)
        builder.start()
        self.addCleanup(builder.stop)

    async def test_local_previews_use_the_grid_node_builder(self):
        with patch(
            "fiftyone.server.metadata._get_additional_media_fields",
            return_value=["media"],
        ), patch(
            "fiftyone.server.samples._create_sample_item",
            AsyncMock(return_value="node"),
        ) as builder:
            nodes = await extensions.build_sample_items("view", ["sample"])
        self.assertEqual(nodes, ["node"])
        self.assertEqual(builder.call_args.args[:2], ("view", "sample"))
        self.assertTrue(builder.call_args.args[4])

    async def test_preview_provider_is_used_and_can_be_removed(self):
        builder = AsyncMock(return_value=["signed-node"])
        unregister = extensions.register_selection_sample_builder(builder)
        try:
            self.assertEqual(
                await extensions.build_sample_items("view", ["sample"]),
                ["signed-node"],
            )
            builder.assert_awaited_once_with("view", ["sample"])
        finally:
            unregister()
        self.assertEqual(await extensions.build_sample_items("view", []), [])
