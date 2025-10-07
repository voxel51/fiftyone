"""
FiftyOne operator type target_view tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import bson

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
