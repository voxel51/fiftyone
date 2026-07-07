"""
FiftyOne operator type target_view tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.operators as foo
from fiftyone.operators import types


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

    def test_no_group_slice_preserves_legacy_behavior(self):
        ctx = self._ctx()
        self.assertEqual(ctx.target_view(require_flat=True), self.dataset)
        self.assertEqual(ctx._get_active_view(require_flat=True), self.dataset)

    def test_default_is_not_scoped_without_require_flat(self):
        ctx = self._ctx(group_slice="left")
        self.assertEqual(ctx.target_view(), self.dataset)

        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])
        self.assertEqual(ctx.target_view().media_type, "group")

    def test_active_media_type_follows_active_slice(self):
        self.assertEqual(
            self._ctx(group_slice="left")._active_media_type, "image"
        )
        self.assertEqual(
            self._ctx(group_slice="lidar")._active_media_type, "point-cloud"
        )

    def test_default_target_is_scoped_to_active_slice(self):
        target = self._ctx(group_slice="left").target_view(require_flat=True)
        self.assertEqual(target.media_type, "image")
        self.assertEqual(len(target), 2)
        self.assertSetEqual(
            set(target.values("filepath")),
            {"/path/to/left1.jpg", "/path/to/left2.jpg"},
        )

    def test_current_view_target_is_scoped_to_active_slice(self):
        ctx = self._ctx(group_slice="lidar")
        ctx.params["view_target"] = foo.constants.ViewTarget.CURRENT_VIEW

        target = ctx.target_view(require_flat=True)
        self.assertEqual(target.media_type, "point-cloud")
        self.assertEqual(len(target), 2)

    def test_dataset_target_is_not_scoped(self):
        ctx = self._ctx(group_slice="left")
        ctx.params["view_target"] = foo.constants.ViewTarget.DATASET

        self.assertEqual(ctx.target_view(require_flat=True), self.dataset)

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

    def test_non_flat_slice_selection_raises(self):
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        with self.assertRaises(ValueError):
            ctx.target_view(require_flat=True)

    def test_non_flat_slice_selection_invalidates_view_target_property(self):
        stage = fo.SelectGroupSlices(["left", "lidar"], flat=False)
        ctx = self._ctx(group_slice="left", view=[stage._serialize()])

        inputs = types.Object()
        prop = inputs.view_target(ctx, require_flat=True)
        self.assertTrue(prop.invalid)
        self.assertIn("flattened view", prop.error_message)

        # without require_flat, the property remains valid
        inputs = types.Object()
        prop = inputs.view_target(ctx)
        self.assertFalse(prop.invalid)
