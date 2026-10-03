"""
Tests for :func:`fiftyone.zoo.models.load_zoo_model`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import types
from unittest import mock

import fiftyone.core.models as fom
import fiftyone.zoo.models as fozm


def test_a_loaded_model_carries_its_zoo_name():
    loaded = types.SimpleNamespace()
    with mock.patch.object(fozm, "download_zoo_model"), mock.patch.object(
        fom, "load_model", return_value=loaded
    ):
        model = fozm.load_zoo_model(
            "clip-vit-base32-torch", ensure_requirements=False, cache=False
        )

    assert model.zoo_model_name == "clip-vit-base32-torch"
