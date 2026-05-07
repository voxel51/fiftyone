"""
FiftyOne operator type tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import MagicMock, patch

import bson

import fiftyone as fo
import fiftyone.operators as foo
from fiftyone.operators import types


class TestPipelineType(unittest.TestCase):
    def test_pipeline_type(self):
        pipeline = types.Pipeline()
        self.assertListEqual(pipeline.stages, [])

        pipeline = types.Pipeline(stages=[])
        self.assertListEqual(pipeline.stages, [])

        stage1 = types.PipelineStage(operator_uri="my/uri")
        stage2 = types.PipelineStage(
            operator_uri="my/uri2",
            name="stage2",
            num_distributed_tasks=5,
            params={"foo": "bar"},
            always_run=True,
        )
        pipeline = types.Pipeline(stages=[stage1, stage2])
        self.assertListEqual(pipeline.stages, [stage1, stage2])

        pipeline = types.Pipeline()
        pipeline.stage(stage1.operator_uri)
        pipeline.stage(
            stage2.operator_uri,
            always_run=stage2.always_run,
            name=stage2.name,
            num_distributed_tasks=stage2.num_distributed_tasks,
            params=stage2.params,
        )
        self.assertListEqual(pipeline.stages, [stage1, stage2])

    def test_serialize(self):
        pipeline = types.Pipeline(
            stages=[
                types.PipelineStage(operator_uri="my/uri"),
                types.PipelineStage(
                    operator_uri="my/uri2",
                    name="stage2",
                    num_distributed_tasks=5,
                    params={"foo": "bar"},
                    request_params_overrides={"view_name": "filtered_view"},
                    always_run=True,
                    rerunnable=False,
                ),
            ]
        )
        dict_rep = pipeline.to_json()
        self.assertDictEqual(
            dict_rep,
            {
                "stages": [
                    {
                        "operator_uri": "my/uri",
                        "name": None,
                        "num_distributed_tasks": None,
                        "params": None,
                        "request_params_overrides": None,
                        "always_run": False,
                        "rerunnable": None,
                    },
                    {
                        "operator_uri": "my/uri2",
                        "name": "stage2",
                        "num_distributed_tasks": 5,
                        "params": {"foo": "bar"},
                        "request_params_overrides": {
                            "view_name": "filtered_view"
                        },
                        "always_run": True,
                        "rerunnable": False,
                    },
                ],
            },
        )
        new_obj = types.Pipeline.from_json(dict_rep)
        self.assertEqual(new_obj, pipeline)

    def test_validation(self):
        with self.assertRaises(ValueError):
            types.PipelineStage(operator_uri=None)

        pipe = types.PipelineStage(
            operator_uri="my/uri", num_distributed_tasks=0
        )
        self.assertIsNone(pipe.num_distributed_tasks)

        pipe = types.PipelineStage(
            operator_uri="my/uri", num_distributed_tasks=-5
        )
        self.assertIsNone(pipe.num_distributed_tasks)

        pipe = types.Pipeline()
        pipe.stage("my/uri", num_distributed_tasks=-5)
        self.assertIsNone(pipe.stages[0].num_distributed_tasks)

    def test_disallowed_keys_stripped(self):
        with self.assertLogs(
            "fiftyone.operators._types.pipeline", level="ERROR"
        ) as log:
            stage = types.PipelineStage(
                operator_uri="my/uri",
                request_params_overrides={
                    "dataset_id": "some_id",
                    "dataset_name": "should_be_stripped",
                    "delegated": True,
                    "delegation_target": "some_target",
                    "request_delegation": True,
                    "results": {},
                    "view_name": "should_be_kept",
                },
            )

        overrides = stage.request_params_overrides
        self.assertNotIn("dataset_id", overrides)
        self.assertNotIn("dataset_name", overrides)
        self.assertNotIn("delegated", overrides)
        self.assertNotIn("delegation_target", overrides)
        self.assertNotIn("request_delegation", overrides)
        self.assertNotIn("results", overrides)
        self.assertEqual(overrides.get("view_name"), "should_be_kept")
        self.assertTrue(any("disallowed" in msg for msg in log.output))

    def test_view_datasetview_auto_serialized(self):
        serialized_stages = [{"_cls": "Limit", "kwargs": [["limit", 10]]}]
        mock_view = MagicMock()
        mock_view._serialize.return_value = serialized_stages

        MockDatasetView = type("DatasetView", (), {})
        mock_view.__class__ = MockDatasetView

        with patch("fiftyone.operators._types.pipeline.fov") as mock_fov:
            mock_fov.DatasetView = MockDatasetView
            stage = types.PipelineStage(
                operator_uri="my/uri",
                request_params_overrides={
                    "view": mock_view,
                    "view_name": "also_kept",
                },
            )

        mock_view._serialize.assert_called_once()
        self.assertEqual(
            stage.request_params_overrides["view"], serialized_stages
        )
        self.assertEqual(
            stage.request_params_overrides["view_name"], "also_kept"
        )

    def test_none(self):
        self.assertIsNone(types.Pipeline.from_json(None))
        self.assertIsNone(types.PipelineRunInfo.from_json(None))

    def test_pipeline_run_info(self):
        run_info = types.PipelineRunInfo(
            active=False,
            stage_index=2,
            expected_children=[1, 2],
            child_errors={"child1": "error1", "child2": "error2"},
        )
        dict_rep = run_info.to_json()
        self.assertEqual(
            dict_rep,
            {
                "active": False,
                "stage_index": 2,
                "expected_children": [1, 2],
                "child_errors": {"child1": "error1", "child2": "error2"},
            },
        )
        new_obj = types.PipelineRunInfo.from_json(dict_rep)
        self.assertEqual(new_obj, run_info)


class TestTextFieldViewType(unittest.TestCase):
    def test_serialize_multiline(self):
        view = types.TextFieldView(multiline=True, rows=5)

        dict_rep = view.to_json()

        self.assertTrue(dict_rep["multiline"])
        self.assertEqual(dict_rep["rows"], 5)

    def test_serialize_multiline_after_define_property_clone(self):
        obj = types.Object()
        obj.str("notes", view=types.TextFieldView(multiline=True, rows=5))

        view_json = obj.to_json()["properties"]["notes"]["view"]

        self.assertTrue(view_json["multiline"])
        self.assertEqual(view_json["rows"], 5)
