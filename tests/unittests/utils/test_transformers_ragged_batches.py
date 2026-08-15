"""
Tests for the ragged-batches contract of fiftyone/utils/transformers.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace

import pytest

# Importing fiftyone.utils.transformers runs ensure_package("transformers")
# at module scope, so the whole module must skip where it is not installed.
transformers = pytest.importorskip("transformers")

from fiftyone.utils.transformers import FiftyOneTransformer


def _image_processor(size, crop_size=None, do_center_crop=False, do_pad=False):
    """A stand-in for a HuggingFace image processor's declared config."""
    return SimpleNamespace(
        size=size,
        crop_size=crop_size,
        do_center_crop=do_center_crop,
        do_pad=do_pad,
    )


def _transforms(processor):
    """A stand-in for ``_HFTransformsHandler`` exposing its ``processor``."""
    return SimpleNamespace(processor=processor)


def _derived_flag(transforms):
    model = FiftyOneTransformer.__new__(FiftyOneTransformer)
    config = SimpleNamespace(ragged_batches=None, transforms=transforms)

    _, ragged_batches = model._build_transforms(config)

    return ragged_batches


class TestRaggedBatchesDerivation:
    @pytest.mark.parametrize(
        "image_processor,expected",
        [
            pytest.param(
                _image_processor({"shortest_edge": 384}),
                True,
                id="lone_shortest_edge_no_crop",
            ),
            pytest.param(
                _image_processor({"longest_edge": 1024}),
                True,
                id="lone_longest_edge_no_crop",
            ),
            pytest.param(
                _image_processor(
                    {"shortest_edge": 800, "longest_edge": 1333}, do_pad=True
                ),
                False,
                id="both_edges_with_padding_detr_style",
            ),
            pytest.param(
                _image_processor({"shortest_edge": 800, "longest_edge": 1333}),
                True,
                id="both_edges_without_padding_is_still_aspect_following",
            ),
            pytest.param(
                _image_processor({"shortest_edge": 384}, do_pad=True),
                True,
                id="padding_does_not_rescue_a_lone_edge",
            ),
            pytest.param(
                _image_processor({"height": 512, "width": 512}),
                False,
                id="fixed_height_and_width",
            ),
            pytest.param(
                _image_processor(
                    {"shortest_edge": 224},
                    crop_size={"height": 224, "width": 224},
                    do_center_crop=True,
                ),
                False,
                id="shortest_edge_with_active_center_crop",
            ),
            pytest.param(
                _image_processor(
                    {"shortest_edge": 384},
                    crop_size={"height": 224, "width": 224},
                ),
                True,
                id="inactive_crop_size_keeps_lone_edge_ragged",
            ),
            pytest.param(
                _image_processor(224), False, id="legacy_integer_size"
            ),
            pytest.param(_image_processor(None), False, id="no_declared_size"),
        ],
    )
    def test_the_flag_matches_the_processors_declared_output_shape(
        self, image_processor, expected
    ):
        transforms = _transforms(
            SimpleNamespace(image_processor=image_processor)
        )

        assert _derived_flag(transforms) is expected

    def test_a_feature_extractor_is_read_when_there_is_no_image_processor(
        self,
    ):
        transforms = _transforms(
            SimpleNamespace(
                feature_extractor=_image_processor({"shortest_edge": 384})
            )
        )

        assert _derived_flag(transforms) is True

    def test_a_vision_only_processor_is_read_directly(self):
        transforms = _transforms(_image_processor({"shortest_edge": 384}))

        assert _derived_flag(transforms) is True

    @pytest.mark.parametrize(
        "explicit,contradicting_size",
        [
            pytest.param(
                True, {"height": 512, "width": 512}, id="explicit_true"
            ),
            pytest.param(False, {"shortest_edge": 384}, id="explicit_false"),
        ],
    )
    def test_an_explicit_config_value_is_honored_over_derivation(
        self, explicit, contradicting_size
    ):
        # The derivation is only a default: a config that states the flag
        # outright keeps its stated value even when the processor's declared
        # output shape says the opposite.
        transforms = _transforms(
            SimpleNamespace(
                image_processor=_image_processor(contradicting_size)
            )
        )
        model = FiftyOneTransformer.__new__(FiftyOneTransformer)
        config = SimpleNamespace(
            ragged_batches=explicit, transforms=transforms
        )

        _, ragged_batches = model._build_transforms(config)

        assert ragged_batches is explicit


class TestRaggedModelLoadContract:
    def test_a_ragged_model_does_not_advertise_a_collate_function(self):
        # ``TorchImageModel.__init__`` refuses to load any model that
        # advertises a collate function while declaring ragged batches, so
        # this pair is what lets a lone-edge model load at all.
        model = FiftyOneTransformer.__new__(FiftyOneTransformer)
        model._ragged_batches = True

        assert model.has_collate_fn is False
        assert not (model.has_collate_fn and model.ragged_batches)

    def test_a_fixed_shape_model_still_advertises_its_collate_function(self):
        model = FiftyOneTransformer.__new__(FiftyOneTransformer)
        model._ragged_batches = False

        assert model.has_collate_fn is True
