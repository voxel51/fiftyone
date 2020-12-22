"""
Model zoo tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.zoo.models as fozm
from fiftyone import ViewField as F


@unittest.skip("Must be run manually")
def test_all_models():
    all_models = foz.list_zoo_models()
    _apply_models(all_models)


@unittest.skip("Must be run manually")
def test_all_embedding_models():
    all_models = foz.list_zoo_models()
    _apply_embedding_models(all_models)


@unittest.skip("Must be run manually")
def test_classification_models():
    manifest = fozm._load_zoo_models_manifest()
    classification_models = [
        model.name
        for model in manifest.models
        if model.has_tag("classification")
    ]

    _apply_models(classification_models)


@unittest.skip("Must be run manually")
def test_detection_models():
    manifest = fozm._load_zoo_models_manifest()
    detection_models = [
        model.name for model in manifest.models if model.has_tag("detection")
    ]

    _apply_models(detection_models)


@unittest.skip("Must be run manually")
def test_instance_segmentation_models():
    manifest = fozm._load_zoo_models_manifest()
    instance_segmentation_models = [
        model.name for model in manifest.models if model.has_tag("instances")
    ]

    _apply_models(instance_segmentation_models)


@unittest.skip("Must be run manually")
def test_semantic_segmentation_models():
    manifest = fozm._load_zoo_models_manifest()
    segmentation_models = [
        model.name
        for model in manifest.models
        if model.has_tag("segmentation")
    ]

    _apply_models(segmentation_models)


@unittest.skip("Must be run manually")
def test_keypoint_models():
    manifest = fozm._load_zoo_models_manifest()
    keypoint_models = [
        model.name for model in manifest.models if model.has_tag("keypoints")
    ]

    _apply_person_keypoint_models(keypoint_models)


def _apply_models(model_names):
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=10,
    )

    f = lambda n: n.lower().replace("-", "_").replace(".", "_")

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name)
        dataset.apply_model(model, label_field=f(model_name))

    session = fo.launch_app(dataset)
    session.wait()


def _apply_embedding_models(model_names):
    # Load a small test dataset
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=10,
    )

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name)

        if not model.has_embeddings:
            print("Model does not have embeddings")
            continue

        embeddings = dataset.compute_embeddings(model)
        print("Embeddings shape: %s" % embeddings.shape)


def _apply_person_keypoint_models(model_names):
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=50,
    )

    person_samples = dataset.filter_detections(
        "ground_truth", F("label") == "person", only_matches=True
    ).limit(5)

    f = lambda n: n.lower().replace("-", "_").replace(".", "_")

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name)
        person_samples.apply_model(model, label_field=f(model_name))

    session = fo.launch_app(view=person_samples)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
