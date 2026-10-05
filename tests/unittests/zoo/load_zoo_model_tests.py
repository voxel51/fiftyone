"""
Tests for loading models from the model zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace
from unittest import mock

import fiftyone.zoo.models as fozm


def test_loaded_model_records_its_zoo_name():
    zoo_model = mock.Mock(
        manager=None, default_deployment_config_dict={"type": "x"}
    )
    zoo_model.name = "yolo11n-coco-torch"
    loaded = SimpleNamespace()

    with mock.patch.object(
        fozm, "_get_model", return_value=zoo_model
    ), mock.patch.object(fozm.fom, "load_model", return_value=loaded):
        model = fozm.load_zoo_model(
            "yolo11n-coco-torch", ensure_requirements=False, cache=False
        )

    assert model is loaded
    assert model.zoo_name == "yolo11n-coco-torch"
