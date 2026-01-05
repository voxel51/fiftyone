"""
FiftyOne operator type tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

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
                    always_run=True,
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
                        "always_run": False,
                    },
                    {
                        "operator_uri": "my/uri2",
                        "name": "stage2",
                        "num_distributed_tasks": 5,
                        "params": {"foo": "bar"},
                        "always_run": True,
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
