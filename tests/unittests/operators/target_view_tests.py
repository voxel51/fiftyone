"""
FiftyOne operator type target_view tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.operators as foo
from fiftyone.operators import types
from fiftyone.operators.executor import UNGROUPED_TARGET_ERROR


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
                    "Borks only the selected samples",
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

    def test_dataset_target_is_unavailable_when_flat_is_required(self):
        ctx = self._ctx(group_slice="left")
        ctx.params["view_target"] = foo.constants.ViewTarget.DATASET

        # the whole grouped dataset cannot be scoped to a slice
        with self.assertRaises(ValueError):
            ctx.target_view(require_flat=True)

        self.assertIn(
            foo.constants.ViewTarget.DATASET,
            ctx.get_unavailable_view_targets(require_flat=True),
        )

        # without require_flat, the grouped dataset is returned as-is
        self.assertEqual(ctx.target_view(), self.dataset)

    def test_base_view_target_is_unavailable_when_grouped(self):
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

        with self.assertRaises(ValueError):
            ctx.target_view(require_flat=True)

        target = ctx.target_view()
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

        # the caller built the view, so it is not scoped on their behalf
        with self.assertRaises(ValueError):
            ctx.target_view(require_flat=True)

        self.assertIn(
            foo.constants.ViewTarget.CUSTOM_VIEW_TARGET,
            ctx.get_unavailable_view_targets(require_flat=True),
        )

        target = ctx.target_view()
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

    def test_non_flat_slice_selection_is_used_as_is(self):
        # the view already selects slices, so it defines its own scope and the
        # active slice is not appended
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "group")
        self.assertEqual(len(target), len(ctx.view))

    def test_non_flat_slice_selection_keeps_the_property_valid(self):
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        for kwargs in ({"require_flat": True}, {}):
            inputs = types.Object()
            prop = inputs.view_target(ctx, **kwargs)
            self.assertFalse(prop.invalid)

    def test_selected_samples_resolve_when_the_view_selects_slices(self):
        # selections are made against the view, so its ids are in scope
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])
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
                UNGROUPED_TARGET_ERROR,
                "Process the current view in the current slice (left)",
            ],
        )

    def test_unavailable_targets_are_disabled_choices(self):
        ctx = self._ctx(group_slice="left")
        prop, _ = self._descriptions(ctx, require_flat=True)

        self.assertEqual(
            prop.options.unavailable, {"DATASET": UNGROUPED_TARGET_ERROR}
        )
        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])
        choices = {c.value: c for c in prop.options.choices_view.choices}
        self.assertEqual(
            choices["DATASET"].description, UNGROUPED_TARGET_ERROR
        )

    def test_no_active_slice_still_offers_the_default_slice(self):
        # the active slice is resolved from the dataset when the caller does
        # not send one, so only the whole grouped dataset stays unavailable
        ctx = self._ctx()
        prop, descriptions = self._descriptions(ctx, require_flat=True)

        self.assertListEqual(prop.options.available_values(), ["CURRENT_VIEW"])
        self.assertEqual(
            prop.options.unavailable, {"DATASET": UNGROUPED_TARGET_ERROR}
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
                UNGROUPED_TARGET_ERROR,
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
            [UNGROUPED_TARGET_ERROR, "Process the current view"],
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
            "Process only the selected samples in the current slice (left)",
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
