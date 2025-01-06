"""
Model inference/embeddings tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/model_tests.py -s -k test_<name>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np
import pytest

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.utils.torch as fout


def test_apply_model():
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(50)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    view.apply_model(model, "predictions1", batch_size=8)
    print(view.count_values("predictions1.label"))

    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf")
    view.apply_model(model, "predictions2")
    print(view.count_values("predictions2.detections.label"))


def test_compute_embeddings():
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(50)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    embeddings1a = view.compute_embeddings(model)
    view.compute_embeddings(model, embeddings_field="embeddings1")
    embeddings1b = _load_embeddings(view, "embeddings1")
    _assert_embeddings_equal(embeddings1a, embeddings1b)

    embeddings2a = view.compute_embeddings(model, batch_size=8)
    view.compute_embeddings(
        model, embeddings_field="embeddings2", batch_size=8
    )
    embeddings2b = _load_embeddings(view, "embeddings2")
    _assert_embeddings_equal(embeddings2a, embeddings2b)


def test_torch_hub_feature_extractor():
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(5)

    model = fout.load_torch_hub_image_model(
        "facebookresearch/dino:main",
        "dino_vits16",
        as_feature_extractor=True,
        image_size=[224, 224],
    )

    embeddings1a = view.compute_embeddings(model, skip_failures=False)
    view.compute_embeddings(model, embeddings_field="embeddings1")
    embeddings1b = _load_embeddings(view, "embeddings1")
    _assert_embeddings_equal(embeddings1a, embeddings1b)

    with pytest.raises(ValueError):
        fout.load_torch_hub_image_model(
            "facebookresearch/dino:main",
            "dino_vits16",
            embeddings_layer="head",
            image_size=[224, 224],
        )


def _load_embeddings(samples, path):
    return np.stack(samples.values(path))


def _assert_embeddings_equal(embeddings1, embeddings2):
    assert np.allclose(embeddings1, embeddings2)


def test_compute_patch_embeddings():
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(5)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    patch_embeddings1a = view.compute_patch_embeddings(model, "ground_truth")
    view.compute_patch_embeddings(
        model, "ground_truth", embeddings_field="patch_embeddings1"
    )
    patch_embeddings1b = _load_patch_embeddings(
        view, "ground_truth.detections.patch_embeddings1"
    )
    _assert_embedding_dicts_equal(patch_embeddings1a, patch_embeddings1b)

    patch_embeddings2a = view.compute_patch_embeddings(
        model, "ground_truth", batch_size=8
    )
    view.compute_patch_embeddings(
        model, "ground_truth", embeddings_field="patch_embeddings2"
    )
    patch_embeddings2b = _load_patch_embeddings(
        view, "ground_truth.detections.patch_embeddings2"
    )
    _assert_embedding_dicts_equal(patch_embeddings2a, patch_embeddings2b)


def _load_patch_embeddings(samples, path):
    embeddings_dict = {}
    for sample_id, embeddings in zip(*samples.values(["id", path])):
        if embeddings:
            embeddings_dict[sample_id] = np.stack(embeddings)

    return embeddings_dict


def _assert_embedding_dicts_equal(embeddings_dict1, embeddings_dict2):
    assert set(embeddings_dict1.keys()) == set(embeddings_dict2.keys())
    for key, embeddings1 in embeddings_dict1.items():
        embeddings2 = embeddings_dict2[key]
        assert np.allclose(embeddings1, embeddings2)


def test_apply_model_frames():
    dataset = foz.load_zoo_dataset("quickstart-video")
    view = dataset.take(2)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    view.apply_model(model, "predictions1", batch_size=8)
    print(view.count_values("frames.predictions1.label"))

    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf")
    view.apply_model(model, "predictions2")
    print(view.count_values("frames.predictions2.detections.label"))


def test_compute_embeddings_frames():
    dataset = foz.load_zoo_dataset("quickstart-video")
    view = dataset.take(2)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    frame_embeddings1a = view.compute_embeddings(model)
    view.compute_embeddings(model, embeddings_field="embeddings1")
    frame_embeddings1b = _load_frame_embeddings(view, "frames.embeddings1")
    _assert_embedding_dicts_equal(frame_embeddings1a, frame_embeddings1b)

    frame_embeddings2a = view.compute_embeddings(model, batch_size=8)
    view.compute_embeddings(
        model, embeddings_field="embeddings2", batch_size=8
    )
    frame_embeddings2b = _load_frame_embeddings(view, "frames.embeddings2")
    _assert_embedding_dicts_equal(frame_embeddings2a, frame_embeddings2b)


def _load_frame_embeddings(samples, path):
    embeddings_dict = {}
    for sample_id, embeddings in zip(*samples.values(["id", path])):
        if embeddings:
            embeddings_dict[sample_id] = np.stack(embeddings)

    return embeddings_dict


def test_compute_patch_embeddings_frames():
    dataset = foz.load_zoo_dataset("quickstart-video")
    view = dataset.take(1)

    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    patch_embeddings1a = view.compute_patch_embeddings(
        model, "frames.detections"
    )
    view.compute_patch_embeddings(
        model, "frames.detections", embeddings_field="patch_embeddings1"
    )
    patch_embeddings1b = _load_frame_patch_embeddings(
        view, "frames.detections.detections.patch_embeddings1"
    )
    _assert_frame_embedding_dicts_equal(patch_embeddings1a, patch_embeddings1b)

    patch_embeddings2a = view.compute_patch_embeddings(
        model, "frames.detections", batch_size=8
    )
    view.compute_patch_embeddings(
        model, "frames.detections", embeddings_field="patch_embeddings2"
    )
    patch_embeddings2b = _load_frame_patch_embeddings(
        view, "frames.detections.detections.patch_embeddings2"
    )
    _assert_frame_embedding_dicts_equal(patch_embeddings2a, patch_embeddings2b)


def _load_frame_patch_embeddings(samples, path):
    embeddings_dict = {}
    for sample_id, frame_numbers, frame_embeddings in zip(
        *samples.values(["id", "frames.frame_number", path])
    ):
        frame_embeddings_dict = {}
        for frame_number, embeddings in zip(frame_numbers, frame_embeddings):
            if embeddings:
                frame_embeddings_dict[frame_number] = np.stack(embeddings)

        embeddings_dict[sample_id] = frame_embeddings_dict

    return embeddings_dict


def _assert_frame_embedding_dicts_equal(embeddings_dict1, embeddings_dict2):
    assert set(embeddings_dict1.keys()) == set(embeddings_dict2.keys())
    for sample_id, frame_embeddings1 in embeddings_dict1.items():
        frame_embeddings2 = embeddings_dict2[sample_id]
        _assert_embedding_dicts_equal(frame_embeddings1, frame_embeddings2)


def test_apply_model_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.png"),
            fo.Sample(filepath="non-existent2.png"),
            fo.Sample(filepath="non-existent3.png"),
            fo.Sample(filepath="non-existent4.png"),
        ]
    )

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.apply_model(model, "predictions1")

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.apply_model(model, "predictions2", batch_size=2)

    # TF, single inference
    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf")
    dataset.apply_model(model, "predictions3")

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.apply_model(model, "predictions4", batch_size=2)


def test_compute_embeddings_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.png"),
            fo.Sample(filepath="non-existent2.png"),
            fo.Sample(filepath="non-existent3.png"),
            fo.Sample(filepath="non-existent4.png"),
        ]
    )

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_embeddings(model)

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_embeddings(model, batch_size=2)

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.compute_embeddings(model, batch_size=2)


def test_compute_patch_embeddings_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.png"),
            fo.Sample(filepath="non-existent2.png"),
            fo.Sample(filepath="non-existent3.png"),
            fo.Sample(filepath="non-existent4.png"),
        ]
    )

    for sample in dataset:
        sample["ground_truth"] = fo.Detections(
            detections=[fo.Detection(bounding_box=[0.1, 0.1, 0.8, 0.8])]
        )
        sample.save()

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_patch_embeddings(model, "ground_truth")

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_patch_embeddings(model, "ground_truth", batch_size=2)

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.compute_patch_embeddings(model, "ground_truth", batch_size=2)


def test_apply_model_frames_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.mp4"),
            fo.Sample(filepath="non-existent2.mp4"),
            fo.Sample(filepath="non-existent3.mp4"),
            fo.Sample(filepath="non-existent4.mp4"),
        ]
    )

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.apply_model(model, "frames.predictions1")

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.apply_model(model, "frames.predictions2", batch_size=2)

    # TF, single inference
    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf")
    dataset.apply_model(model, "frames.predictions3")

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.apply_model(model, "frames.predictions4", batch_size=2)


def test_compute_embeddings_frames_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.mp4"),
            fo.Sample(filepath="non-existent2.mp4"),
            fo.Sample(filepath="non-existent3.mp4"),
            fo.Sample(filepath="non-existent4.mp4"),
        ]
    )

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_embeddings(model)

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_embeddings(model, batch_size=2)

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.compute_embeddings(model, batch_size=2)


def test_compute_patch_embeddings_frames_skip_failures():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="non-existent1.mp4"),
            fo.Sample(filepath="non-existent2.mp4"),
            fo.Sample(filepath="non-existent3.mp4"),
            fo.Sample(filepath="non-existent4.mp4"),
        ]
    )

    for sample in dataset:
        frame = sample.frames[1]
        frame["ground_truth"] = fo.Detections(
            detections=[fo.Detection(bounding_box=[0.1, 0.1, 0.8, 0.8])]
        )
        sample.save()

    # torch, data loader, single batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_patch_embeddings(model, "frames.ground_truth")

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_patch_embeddings(
        model, "frames.ground_truth", batch_size=2
    )

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.compute_patch_embeddings(
        model, "frames.ground_truth", batch_size=2
    )


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
