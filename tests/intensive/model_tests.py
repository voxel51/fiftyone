"""
Model inference/embeddings tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/model_tests.py -s -k test_<name>

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np

import fiftyone as fo
import fiftyone.zoo as foz


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

    model = foz.load_zoo_model("mobilenet-v2-imagenet-tf1")

    embeddings1a = view.compute_embeddings(model)

    view.compute_embeddings(model, embeddings_field="embeddings1")
    embeddings1b = np.stack(view.values("embeddings1"))

    # embeddings1a and embeddings1b should match

    embeddings2a = view.compute_embeddings(model, batch_size=8)

    view.compute_embeddings(
        model, embeddings_field="embeddings2", batch_size=8
    )
    embeddings2b = np.stack(view.values("embeddings2"))

    # embeddings2a and embeddings2b should match


def test_compute_patch_embeddings():
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(50)

    model = foz.load_zoo_model("mobilenet-v2-imagenet-tf1")

    patch_embeddings1a = view.compute_patch_embeddings(model, "ground_truth")

    view.compute_patch_embeddings(
        model, "ground_truth", embeddings_field="patch_embeddings1"
    )
    patch_embeddings1b = {
        _id: e
        for _id, e in zip(view.values("id"), view.values("patch_embeddings1"))
    }

    # patch_embeddings1a and patch_embeddings1b should match

    patch_embeddings2a = view.compute_patch_embeddings(
        model, "ground_truth", batch_size=8
    )

    view.compute_patch_embeddings(
        model, "ground_truth", embeddings_field="patch_embeddings2"
    )
    patch_embeddings2b = {
        _id: e
        for _id, e in zip(view.values("id"), view.values("patch_embeddings2"))
    }

    # patch_embeddings2a and patch_embeddings2b should match


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

    model = foz.load_zoo_model("mobilenet-v2-imagenet-tf1")

    embeddings1a = view.compute_embeddings(model)

    view.compute_embeddings(model, embeddings_field="embeddings1")
    embeddings1b = {
        _id: np.stack(e)
        for _id, e in zip(view.values("id"), view.values("frames.embeddings1"))
    }

    # embeddings1a and embeddings1b should match

    embeddings2a = view.compute_embeddings(model, batch_size=8)

    view.compute_embeddings(
        model, embeddings_field="embeddings2", batch_size=8
    )
    embeddings2b = {
        _id: np.stack(e)
        for _id, e in zip(view.values("id"), view.values("frames.embeddings2"))
    }

    # embeddings2a and embeddings2b should match


def test_compute_patch_embeddings_frames():
    dataset = foz.load_zoo_dataset("quickstart-video")
    view = dataset.take(2)

    model = foz.load_zoo_model("mobilenet-v2-imagenet-tf1")

    patch_embeddings1a = view.compute_patch_embeddings(model, "detections")

    view.compute_patch_embeddings(
        model, "detections", embeddings_field="patch_embeddings1"
    )
    patch_embeddings1b = {
        _id: {fn: p for fn, p in enumerate(e, 1)}
        for _id, e in zip(
            view.values("id"), view.values("frames.patch_embeddings1")
        )
    }

    # patch_embeddings1a and patch_embeddings1b should match

    patch_embeddings2a = view.compute_patch_embeddings(
        model, "detections", batch_size=8
    )

    view.compute_patch_embeddings(
        model, "detections", embeddings_field="patch_embeddings2"
    )
    patch_embeddings2b = {
        _id: {fn: p for fn, p in enumerate(e, 1)}
        for _id, e in zip(
            view.values("id"), view.values("frames.patch_embeddings2")
        )
    }

    # patch_embeddings2a and patch_embeddings2b should match


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
    dataset.compute_patch_embeddings(model, "ground_truth")

    # torch, data loader, batches
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    dataset.compute_patch_embeddings(model, "ground_truth", batch_size=2)

    # TF, batch inference
    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")
    dataset.compute_patch_embeddings(model, "ground_truth", batch_size=2)


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
