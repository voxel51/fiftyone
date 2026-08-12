"""
FiftyOne operator type target_view tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import os
import unittest

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.operators as foo
from fiftyone.operators import types
from fiftyone.operators.executor import (
    GROUPED_TARGET_ERROR_MESSAGE,
    do_execute_operator,
)


class TestResolveOperatorTargetViewInputs(unittest.TestCase):
    def test_all_options(self):
        ds = fo.Dataset()
        try:
            request_params = {
                "dataset_name": ds.name,
                "dataset_id": ds._doc.id,
                "view": [
                    {
                        "_cls": "fiftyone.core.stages.Limit",
                        "kwargs": [["limit", 3]],
                    }
                ],
                "selected": ["sample_id_one"],
                "selected_labels": [{"label_id": "label_id_one"}],
            }
            ctx = foo.ExecutionContext(
                operator_uri="test_operator",
                request_params=request_params,
            )
            inputs = types.Object()
            res = inputs.view_target(
                ctx,
                action_description="Borks",
                allow_dataset_view=True,
                allow_selected_labels=True,
                default_target=foo.constants.ViewTarget.SELECTED_SAMPLES,
            )
            prop = inputs.properties["view_target"]
            self.assertIs(res, prop)
            self.assertIsInstance(prop.type, types.Enum)
            self.assertListEqual(
                prop.type.values,
                [
                    foo.constants.ViewTarget.DATASET,
                    foo.constants.ViewTarget.DATASET_VIEW,
                    foo.constants.ViewTarget.CURRENT_VIEW,
                    foo.constants.ViewTarget.SELECTED_SAMPLES,
                    foo.constants.ViewTarget.SELECTED_LABELS,
                ],
            )
            self.assertListEqual(
                prop.options.values(),
                [
                    foo.constants.ViewTarget.DATASET,
                    foo.constants.ViewTarget.DATASET_VIEW,
                    foo.constants.ViewTarget.CURRENT_VIEW,
                    foo.constants.ViewTarget.SELECTED_SAMPLES,
                    foo.constants.ViewTarget.SELECTED_LABELS,
                ],
            )
            self.assertEqual(
                prop.default, foo.constants.ViewTarget.SELECTED_SAMPLES
            )
            self.assertIsInstance(prop.view, types.RadioGroup)
            self.assertListEqual(
                [choice.label for choice in prop.view.choices],
                [
                    "Entire dataset",
                    "Dataset",
                    "Current view",
                    "Selected samples",
                    "Selected labels",
                ],
            )
            self.assertListEqual(
                [choice.description for choice in prop.view.choices],
                [
                    "Borks the entire dataset",
                    "Borks the dataset view",
                    "Borks the current view",
                    "Borks the selected samples",
                    "Borks only the selected labels",
                ],
            )
        finally:
            ds.delete()

    def test_no_options(self):
        ds = fo.Dataset()
        try:
            request_params = {
                "dataset_name": ds.name,
                "dataset_id": ds._doc.id,
            }
            ctx = foo.ExecutionContext(
                operator_uri="test_operator",
                request_params=request_params,
            )
            inputs = types.Object()
            res = inputs.view_target(
                ctx,
                allow_selected_labels=True,
            )
            prop = inputs.properties["view_target"]
            self.assertIs(prop, res)
            self.assertListEqual(
                prop.options.values(), [foo.constants.ViewTarget.DATASET]
            )
            self.assertIsInstance(prop.view, types.HiddenView)
            self.assertEqual(ctx.target_view(), ds)
        finally:
            ds.delete()

    def test_label_description_override(self):
        ds = fo.Dataset()
        try:
            request_params = {
                "dataset_name": ds.name,
                "dataset_id": ds._doc.id,
                "view": [
                    {
                        "_cls": "fiftyone.core.stages.Limit",
                        "kwargs": [["limit", 3]],
                    }
                ],
                "selected": ["sample_id_one"],
                "selected_labels": [{"label_id": "label_id_one"}],
            }
            ctx = foo.ExecutionContext(
                operator_uri="test_operator",
                request_params=request_params,
            )
            inputs = types.Object()

            #####
            res = inputs.view_target(
                ctx,
                action_description="Borks",
                allow_dataset_view=True,
                allow_selected_labels=True,
                dataset_label="Blah dataset",
                dataset_description="Blah dataset description",
                dataset_view_label="Blah dataset view",
                dataset_view_description="Blah dataset view description",
                current_view_label="Blah current view",
                current_view_description="Blah current view description",
                selected_samples_label="Blah selected samples",
                selected_samples_description="Blah selected samples description",
                selected_labels_label="Blah selected labels",
                selected_labels_description="Blah selected labels description",
            )
            #####

            prop = inputs.properties["view_target"]
            self.assertIs(prop, res)
            self.assertIsInstance(prop.type, types.Enum)
            self.assertListEqual(
                prop.type.values,
                [
                    foo.constants.ViewTarget.DATASET,
                    foo.constants.ViewTarget.DATASET_VIEW,
                    foo.constants.ViewTarget.CURRENT_VIEW,
                    foo.constants.ViewTarget.SELECTED_SAMPLES,
                    foo.constants.ViewTarget.SELECTED_LABELS,
                ],
            )
            self.assertListEqual(
                prop.options.values(),
                [
                    foo.constants.ViewTarget.DATASET,
                    foo.constants.ViewTarget.DATASET_VIEW,
                    foo.constants.ViewTarget.CURRENT_VIEW,
                    foo.constants.ViewTarget.SELECTED_SAMPLES,
                    foo.constants.ViewTarget.SELECTED_LABELS,
                ],
            )
            self.assertIsInstance(prop.view, types.RadioGroup)
            self.assertListEqual(
                [choice.label for choice in prop.view.choices],
                [
                    "Blah dataset",
                    "Blah dataset view",
                    "Blah current view",
                    "Blah selected samples",
                    "Blah selected labels",
                ],
            )
            self.assertListEqual(
                [choice.description for choice in prop.view.choices],
                [
                    "Blah dataset description",
                    "Blah dataset view description",
                    "Blah current view description",
                    "Blah selected samples description",
                    "Blah selected labels description",
                ],
            )
        finally:
            ds.delete()


class TestGroupedDatasetTargetView(unittest.TestCase):
    """Resolution of ``ctx.target_view()`` for grouped datasets."""

    dataset = None

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.add_group_field("group", default="left")

        group1 = fo.Group()
        group2 = fo.Group()
        cls.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left1.jpg",
                    group=group1.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar1.pcd",
                    group=group1.element("lidar"),
                ),
                fo.Sample(
                    filepath="/path/to/left2.jpg",
                    group=group2.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar2.pcd",
                    group=group2.element("lidar"),
                ),
            ]
        )

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def setUp(self):
        # contexts with a group_slice reassign the singleton's active slice,
        # so reset it for test independence
        self.dataset.group_slice = "left"

    def _ctx(self, **request_params):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                **request_params,
            ),
        )

    def test_callers_that_do_not_require_flat_still_get_groups(self):
        # ``require_flat`` defaults to False so that operators written against
        # grouped collections keep receiving them
        for ctx in (self._ctx(), self._ctx(group_slice="left")):
            self.assertEqual(ctx.target_view(), self.dataset)
            self.assertEqual(ctx.target_view().media_type, fom.GROUP)

    def test_no_group_slice_falls_back_to_the_default_slice(self):
        # a caller that does not send the active slice still gets a flat
        # collection, scoped to the dataset default
        ctx = self._ctx()
        self.assertEqual(
            ctx.target_view(require_flat=True).media_type, fom.IMAGE
        )
        self.assertEqual(ctx.flatten_group_slices().media_type, fom.IMAGE)
        self.assertListEqual(
            ctx.target_view(require_flat=True).values("filepath"),
            self.dataset.select_group_slices(
                self.dataset.default_group_slice
            ).values("filepath"),
        )

    def test_default_is_not_scoped_without_require_flat(self):
        ctx = self._ctx(group_slice="left")
        self.assertEqual(ctx.target_view(), self.dataset)

        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])
        self.assertEqual(ctx.target_view().media_type, "group")

    def test_active_media_type_follows_active_slice(self):
        self.assertEqual(
            self._ctx(group_slice="left").active_media_type, "image"
        )
        self.assertEqual(
            self._ctx(group_slice="lidar").active_media_type, "point-cloud"
        )

    def test_default_target_is_scoped_to_active_slice(self):
        target = self._ctx(group_slice="left").target_view(require_flat=True)
        self.assertEqual(target.media_type, "image")
        self.assertEqual(len(target), 2)
        self.assertSetEqual(
            {os.path.basename(f) for f in target.values("filepath")},
            {"left1.jpg", "left2.jpg"},
        )

    def test_automatic_slice_scoping_is_logged_once(self):
        ctx = self._ctx(group_slice="left")

        with self.assertLogs(
            "fiftyone.operators.executor", level="INFO"
        ) as logs:
            ctx.target_view(require_flat=True)

        self.assertEqual(len(logs.records), 1)
        self.assertIn("left", logs.output[0])

    def test_offering_targets_does_not_log_a_scope(self):
        # resolve_input runs on every form change, so probing which targets
        # are available must stay silent
        ctx = self._ctx(group_slice="left")

        with self.assertNoLogs("fiftyone.operators.executor", level="INFO"):
            ctx.get_unavailable_view_targets(require_flat=True)
            inputs = types.Object()
            inputs.view_target(ctx, require_flat=True)

    def test_explicit_slice_override_is_not_announced(self):
        # the caller named the slices, so nothing was chosen for them
        ctx = self._ctx(group_slice="left")

        with self.assertNoLogs("fiftyone.operators.executor", level="INFO"):
            ctx.flatten_group_slices(media_type="image")

    def test_current_view_target_is_scoped_to_active_slice(self):
        ctx = self._ctx(group_slice="lidar")
        ctx.params["view_target"] = foo.constants.ViewTarget.CURRENT_VIEW

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "point-cloud")
        self.assertEqual(len(target), 2)

    def test_dataset_target_is_unavailable_but_passes_through(self):
        ctx = self._ctx(group_slice="left")
        ctx.params["view_target"] = foo.constants.ViewTarget.DATASET

        # the whole grouped dataset is not offered to flat-requiring forms
        self.assertIn(
            foo.constants.ViewTarget.DATASET,
            ctx.get_unavailable_view_targets(require_flat=True),
        )

        # but a caller that names it anyway (e.g. a custom plugin) gets the
        # dataset as-is, never an error
        self.assertEqual(ctx.target_view(require_flat=True), self.dataset)
        self.assertEqual(ctx.target_view(), self.dataset)

    def test_base_view_target_passes_through_when_grouped(self):
        ctx = self._ctx(
            group_slice="left",
            view=[
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 1]],
                }
            ],
        )
        ctx.params["view_target"] = foo.constants.ViewTarget.BASE_VIEW

        for target in (
            ctx.target_view(require_flat=True),
            ctx.target_view(),
        ):
            self.assertEqual(target.media_type, "group")
            self.assertEqual(len(target), 2)

    def test_custom_view_target_is_unavailable_when_grouped(self):
        ctx = self._ctx(group_slice="left")
        ctx.params["view_target"] = foo.constants.ViewTarget.CUSTOM_VIEW_TARGET
        ctx.params["custom_view_target"] = [
            {
                "_cls": "fiftyone.core.stages.Limit",
                "kwargs": [["limit", 1]],
            }
        ]

        # the caller built the view, so it is not scoped on their behalf and
        # passes through as-is
        self.assertIn(
            foo.constants.ViewTarget.CUSTOM_VIEW_TARGET,
            ctx.get_unavailable_view_targets(require_flat=True),
        )

        for target in (
            ctx.target_view(require_flat=True),
            ctx.target_view(),
        ):
            self.assertEqual(target.media_type, "group")
            self.assertEqual(len(target), 1)

    def test_applied_view_is_scoped_to_active_slice(self):
        ctx = self._ctx(
            group_slice="left",
            view=[
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 1]],
                }
            ],
        )

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "image")
        self.assertEqual(len(target), 1)

    def test_flattened_view_is_used_as_is(self):
        stage = fo.SelectGroupSlices("lidar")
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "point-cloud")
        self.assertEqual(len(target), 2)

    def _ctx_with_two_image_slices(self, **request_params):
        # a second dataset with two same-media-type slices ("left", "right"),
        # so a multi-slice selection can be flattened without also mixing
        # media types (this class's shared dataset only has one image slice)
        dataset = fo.Dataset()
        self.addCleanup(dataset.delete)

        group1 = fo.Group()
        dataset.add_group_field("group", default="left")
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left3.jpg",
                    group=group1.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/right3.jpg",
                    group=group1.element("right"),
                ),
            ]
        )

        ctx = foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=dataset.name,
                dataset_id=dataset._doc.id,
                **request_params,
            ),
        )
        return ctx, dataset

    def test_non_flat_slice_selection_is_not_reprocessed(self):
        # the view already selects its slices, so it defines its own scope
        # and is resolved as-is, even though it is still grouped
        stage = fo.SelectGroupSlices(["left", "right"], flat=False)
        ctx, _ = self._ctx_with_two_image_slices(view=[stage._serialize()])

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "group")
        self.assertEqual(target._serialize(), ctx.view._serialize())

    def test_non_flat_slice_selection_makes_the_current_view_unavailable(self):
        # the view is not reprocessed, so it stays grouped and an operation
        # that requires a flat collection cannot target it
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(view=[stage._serialize()])

        self.assertIn(
            foo.constants.ViewTarget.CURRENT_VIEW,
            ctx.get_unavailable_view_targets(require_flat=True),
        )

    def test_non_flat_slice_selection_keeps_the_property_valid(self):
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        for kwargs in ({"require_flat": True}, {}):
            inputs = types.Object()
            prop = inputs.view_target(ctx, **kwargs)
            self.assertFalse(prop.invalid)

    def test_selected_samples_resolve_when_the_view_selects_slices(self):
        # selections are made against the view, so its ids are in scope
        stage = fo.SelectGroupSlices(["left", "right"], flat=False)
        ctx, _ = self._ctx_with_two_image_slices(
            group_slice="left", view=[stage._serialize()]
        )
        selected = ctx.view.values("id")[:1]

        ctx.request_params["selected"] = selected
        ctx.params["view_target"] = foo.constants.ViewTarget.SELECTED_SAMPLES

        target = ctx.target_view(require_flat=True)
        self.assertListEqual(target.values("id"), selected)


class TestGroupSliceOverrideTargetView(unittest.TestCase):
    """Resolution of ``ctx.target_view()`` for operations that always run on
    specific group slices.
    """

    dataset = None

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.add_group_field("group", default="lidar")

        group1 = fo.Group()
        group2 = fo.Group()
        cls.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left1.jpg",
                    group=group1.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/right1.jpg",
                    group=group1.element("right"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar1.pcd",
                    group=group1.element("lidar"),
                ),
                fo.Sample(
                    filepath="/path/to/left2.jpg",
                    group=group2.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/right2.jpg",
                    group=group2.element("right"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar2.pcd",
                    group=group2.element("lidar"),
                ),
            ]
        )

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def setUp(self):
        self.dataset.group_slice = "lidar"

    def _ctx(self, **request_params):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                **request_params,
            ),
        )

    def test_media_type_override_ignores_active_slice(self):
        ctx = self._ctx(group_slice="lidar")

        target = ctx.flatten_group_slices(media_type="image")
        self.assertEqual(target.media_type, "image")
        self.assertEqual(len(target), 4)

    def test_flatten_group_slices_scopes_dataset(self):
        ctx = self._ctx(group_slice="lidar")

        target = ctx.flatten_group_slices(ctx.dataset, media_type="image")
        self.assertEqual(target.media_type, "image")
        self.assertEqual(len(target), 4)

        # with no override, the active slice is used
        target = ctx.flatten_group_slices(ctx.dataset)
        self.assertEqual(target.media_type, "point-cloud")
        self.assertEqual(len(target), 2)

    def test_override_is_used_as_is_for_flattened_views(self):
        stage = fo.SelectGroupSlices("lidar")
        ctx = self._ctx(group_slice="lidar", view=[stage._serialize()])

        target = ctx.flatten_group_slices(ctx.view, media_type="image")
        self.assertEqual(target.media_type, "point-cloud")


class TestGroupSliceScopeDescriptions(unittest.TestCase):
    """Group slice scopes surfaced by ``view_target`` properties."""

    dataset = None

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.add_group_field("group", default="left")

        group = fo.Group()
        cls.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left1.jpg",
                    group=group.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/right1.jpg",
                    group=group.element("right"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar1.pcd",
                    group=group.element("lidar"),
                ),
            ]
        )

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def setUp(self):
        self.dataset.group_slice = "left"

    def _ctx(self, **request_params):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                **request_params,
            ),
        )

    def _descriptions(self, ctx, **kwargs):
        inputs = types.Object()
        prop = inputs.view_target(ctx, **kwargs)
        choices = prop.options.choices_view.choices
        return prop, [c.description for c in choices]

    def test_legacy_operators_keep_every_target(self):
        # ``require_flat`` is opt-in, so an operator written before it existed
        # still gets the whole grouped dataset offered and selectable
        ctx = self._ctx(group_slice="left")
        prop, _ = self._descriptions(ctx)

        self.assertEqual(prop.options.unavailable, {})
        self.assertListEqual(
            prop.options.available_values(), ["DATASET", "CURRENT_VIEW"]
        )

    def test_grouped_datasets_offer_the_active_slice(self):
        ctx = self._ctx(group_slice="left")
        prop, descriptions = self._descriptions(ctx, require_flat=True)

        # the current view is the active slice, so it is offered without a
        # view applied, and the whole grouped dataset is not selectable
        self.assertListEqual(
            prop.options.values(), ["DATASET", "CURRENT_VIEW"]
        )
        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])
        self.assertEqual(prop.default, "CURRENT_VIEW")
        self.assertIsInstance(prop.view, types.RadioGroup)
        self.assertListEqual(
            descriptions,
            [
                GROUPED_TARGET_ERROR_MESSAGE,
                "Process the current view in the current slice (left)",
            ],
        )

    def test_unavailable_targets_are_disabled_choices(self):
        ctx = self._ctx(group_slice="left")
        prop, _ = self._descriptions(ctx, require_flat=True)

        self.assertEqual(
            prop.options.unavailable, {"DATASET": GROUPED_TARGET_ERROR_MESSAGE}
        )
        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])
        choices = {c.value: c for c in prop.options.choices_view.choices}
        self.assertEqual(
            choices["DATASET"].description, GROUPED_TARGET_ERROR_MESSAGE
        )

    def test_no_active_slice_still_offers_the_default_slice(self):
        # the active slice is resolved from the dataset when the caller does
        # not send one, so only the whole grouped dataset stays unavailable
        ctx = self._ctx()
        prop, descriptions = self._descriptions(ctx, require_flat=True)

        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])
        self.assertEqual(
            prop.options.unavailable, {"DATASET": GROUPED_TARGET_ERROR_MESSAGE}
        )
        self.assertEqual(prop.default, "CURRENT_VIEW")
        self.assertFalse(prop.invalid)
        self.assertEqual(
            descriptions[-1],
            "Process the current view in the current slice "
            f"({self.dataset.default_group_slice})",
        )

    def test_view_targets_describe_the_active_slice(self):
        ctx = self._ctx(
            group_slice="left",
            view=[
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 1]],
                }
            ],
        )
        _, descriptions = self._descriptions(ctx, require_flat=True)

        self.assertListEqual(
            descriptions,
            [
                GROUPED_TARGET_ERROR_MESSAGE,
                "Process the current view in the current slice (left)",
            ],
        )

    def test_named_slices_override(self):
        # panels supply their own scope, so both of
        # ``select_group_slices()``'s selectors are available
        ctx = self._ctx(group_slice="left")

        target = ctx.flatten_group_slices(ctx.dataset, slices="lidar")
        self.assertEqual(target.media_type, "point-cloud")
        self.assertEqual(len(target), 1)

    def test_no_scope_for_views_that_select_slices(self):
        stage = fo.SelectGroupSlices("left")
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])
        prop, descriptions = self._descriptions(ctx, require_flat=True)

        # the view defines its own slice scope, so it is not described, but the
        # dataset itself remains grouped
        self.assertListEqual(
            descriptions,
            [GROUPED_TARGET_ERROR_MESSAGE, "Process the current view"],
        )
        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])

    def test_selected_samples_target_is_scoped_to_the_active_slice(self):
        ctx = self._ctx(group_slice="left", selected=["sample_id_one"])
        prop, descriptions = self._descriptions(ctx, require_flat=True)

        self.assertListEqual(
            prop.options.values(),
            ["DATASET", "CURRENT_VIEW", "SELECTED_SAMPLES"],
        )
        self.assertListEqual(
            prop.options.available_values(),
            ["CURRENT_VIEW", "SELECTED_SAMPLES"],
        )
        self.assertEqual(
            descriptions[-1],
            "Process the selected samples in the current slice (left)",
        )

    def test_no_scope_for_ungrouped_datasets(self):
        ds = fo.Dataset()
        try:
            ctx = foo.ExecutionContext(
                operator_uri="test_operator",
                request_params=dict(
                    dataset_name=ds.name, dataset_id=ds._doc.id
                ),
            )
            prop, descriptions = self._descriptions(ctx, require_flat=True)
            self.assertIsInstance(prop.view, types.HiddenView)
            self.assertListEqual(descriptions, ["Process the entire dataset"])
        finally:
            ds.delete()


class TestSelectedSamplesTargetView(unittest.TestCase):
    """The App sends `selected` as bare sample IDs; see
    ``formatSelectionPayload`` in ``app/packages/operators/src/operators.ts``.
    """

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.persistent = False
        cls.dataset.add_samples(
            [
                fo.Sample(filepath="/path/to/one.jpg"),
                fo.Sample(filepath="/path/to/two.jpg"),
            ]
        )
        cls.ids = cls.dataset.values("id")

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _target_view(self, selected):
        ctx = foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                selected=selected,
                params=dict(view_target="SELECTED_SAMPLES"),
            ),
        )
        return ctx.target_view()

    def test_flat_selection_is_used_as_is(self):
        view = self._target_view(self.ids[:1])
        self.assertListEqual(view.values("id"), self.ids[:1])

    def test_multiple_selected_samples(self):
        view = self._target_view(self.ids)
        self.assertListEqual(sorted(view.values("id")), sorted(self.ids))

    def test_empty_selection_selects_nothing(self):
        view = self._target_view([])
        self.assertListEqual(view.values("id"), [])


class _FormOperator(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(name="form_op", label="Form op")

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("field", label="Field")
        return types.Property(inputs)


class _TargetResolvingOperator(foo.Operator):
    """An operator whose form resolves the target view it will process."""

    @property
    def config(self):
        return foo.OperatorConfig(name="resolving_op", label="Resolving op")

    def resolve_input(self, ctx):
        inputs = types.Object()
        ctx.target_view()
        inputs.str("field", label="Field")
        return types.Property(inputs)


class _DeclaredTargetOperator(_FormOperator):
    @property
    def config(self):
        return foo.OperatorConfig(name="declared_op", label="Declared op")

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.view_target(ctx, require_flat=True)
        inputs.str("field", label="Field")
        ctx.target_view(require_flat=True)
        return types.Property(inputs)


class _OptOutOperator(_TargetResolvingOperator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="opt_out_op", label="Opt out", view_target=False
        )


class _NoFormOperator(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(name="no_form_op", label="No form")


class _FlatResolvingOperator(foo.Operator):
    """An operator whose form derives from the flattened target view."""

    @property
    def config(self):
        return foo.OperatorConfig(name="flat_op", label="Flat op")

    def resolve_input(self, ctx):
        inputs = types.Object()
        target_view = ctx.target_view(require_flat=True)
        inputs.str("field", label=f"Field ({target_view.media_type})")
        return types.Property(inputs)


class _RecordingOperator(foo.Operator):
    """An operator which records what its ``execute()`` observes."""

    def __init__(self):
        super().__init__(_builtin=True)
        self.seen_params = None
        self.seen_ids = None

    @property
    def config(self):
        return foo.OperatorConfig(name="recording_op", label="Recording op")

    def execute(self, ctx):
        self.seen_params = dict(ctx.params)
        self.seen_ids = ctx.target_view().values("id")


class TestAutomaticViewTargetInput(unittest.TestCase):
    """The view target is a system input: forms whose operators resolve a
    target receive it automatically, without declaring it."""

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.persistent = False

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _ctx(self):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                params={},
            ),
        )

    def test_target_resolving_forms_receive_the_view_target_first(self):
        prop = _TargetResolvingOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        names = list(prop.type.properties.keys())
        self.assertEqual(names[0], "view_target")
        self.assertIsInstance(
            prop.type.properties["view_target"], types.ViewTargetProperty
        )

    def test_forms_that_never_resolve_a_target_are_untouched(self):
        prop = _FormOperator(_builtin=True).resolve_type(self._ctx(), "inputs")

        self.assertNotIn("view_target", prop.type.properties)

    def test_declared_view_target_is_not_duplicated(self):
        prop = _DeclaredTargetOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        targets = [
            name
            for name, p in prop.type.properties.items()
            if isinstance(p, types.ViewTargetProperty)
        ]
        self.assertListEqual(targets, ["view_target"])

    def test_config_can_omit_the_view_target(self):
        prop = _OptOutOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        self.assertNotIn("view_target", prop.type.properties)

    def test_operators_without_forms_are_unaffected(self):
        prop = _NoFormOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        self.assertIsNone(prop)


class TestAutomaticViewTargetFlatness(unittest.TestCase):
    """An operator that resolves ``ctx.target_view(require_flat=True)`` while
    building its form receives a target input that rejects targets it cannot
    flatten."""

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.add_group_field("group", default="left")

        group = fo.Group()
        cls.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left.jpg",
                    group=group.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/lidar.pcd",
                    group=group.element("lidar"),
                ),
            ]
        )

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _ctx(self):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                group_slice="left",
                params={},
            ),
        )

    def test_flat_resolution_excludes_grouped_targets(self):
        prop = _FlatResolvingOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        self.assertNotIn(
            foo.constants.ViewTarget.DATASET,
            prop.type.properties["view_target"].type.values,
        )

    def test_grouped_targets_stay_available_without_flat_resolution(self):
        prop = _TargetResolvingOperator(_builtin=True).resolve_type(
            self._ctx(), "inputs"
        )

        self.assertIn(
            foo.constants.ViewTarget.DATASET,
            prop.type.properties["view_target"].type.values,
        )

    def test_a_stale_target_still_builds_the_form(self):
        # a recorded whole-dataset target from a custom plugin passes
        # through untouched, so the form builds normally
        ctx = foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                group_slice="left",
                view_target=foo.constants.ViewTarget.DATASET,
                params={},
            ),
        )

        prop = _FlatResolvingOperator(_builtin=True).resolve_type(
            ctx, "inputs"
        )

        self.assertIn("field", prop.type.properties)


class TestSystemViewTargetParam(unittest.TestCase):
    """The ``view_target`` choice is a system input carried at the request
    level; operator params never hold it."""

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.persistent = False
        cls.dataset.add_samples(
            [
                fo.Sample(filepath="/path/to/one.jpg"),
                fo.Sample(filepath="/path/to/two.jpg"),
            ]
        )
        cls.ids = cls.dataset.values("id")

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _ctx(self, params):
        return foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                selected=self.ids[:1],
                params=params,
            ),
        )

    def test_request_level_view_target_resolves_the_recorded_choice(self):
        ctx = foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                selected=self.ids[:1],
                view_target=foo.constants.ViewTarget.SELECTED_SAMPLES,
                params={},
            ),
        )

        view = ctx.target_view()

        self.assertListEqual(view.values("id"), self.ids[:1])

    def test_execute_receives_params_without_the_system_target(self):
        operator = _RecordingOperator()
        ctx = self._ctx(
            dict(
                view_target=foo.constants.ViewTarget.SELECTED_SAMPLES,
                other="value",
            )
        )

        asyncio.run(do_execute_operator(operator, ctx, exhaust=True))

        self.assertEqual(operator.seen_params, {"other": "value"})
        self.assertListEqual(operator.seen_ids, self.ids[:1])

    def test_params_level_choice_wins_over_an_inherited_one(self):
        # the params value comes from the caller, so it beats a request-level
        # value inherited from an enclosing run
        ctx = foo.ExecutionContext(
            operator_uri="test_operator",
            request_params=dict(
                dataset_name=self.dataset.name,
                dataset_id=self.dataset._doc.id,
                selected=self.ids[:1],
                view_target=foo.constants.ViewTarget.DATASET,
                params=dict(
                    view_target=foo.constants.ViewTarget.SELECTED_SAMPLES
                ),
            ),
        )

        view = ctx.target_view()

        self.assertListEqual(view.values("id"), self.ids[:1])

    def test_operator_owned_target_params_are_left_alone(self):
        # operators that declare their own target property under a custom
        # name (e.g. "target") keep owning that param
        ctx = self._ctx(dict(target=foo.constants.ViewTarget.SELECTED_SAMPLES))

        self.assertEqual(
            ctx.params.get("target"),
            foo.constants.ViewTarget.SELECTED_SAMPLES,
        )
        self.assertListEqual(
            ctx.target_view(param_name="target").values("id"), self.ids[:1]
        )
        self.assertListEqual(
            sorted(ctx.target_view().values("id")), sorted(self.ids)
        )
