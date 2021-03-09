"""
Model zoo tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/model_zoo_tests.py -s -k test_<name>

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_all_models():
    all_models = foz.list_zoo_models()
    _apply_models(all_models)


def test_classification_models():
    models = _get_models_with_tag("classification")
    _apply_models(models)


def test_detection_models():
    models = _get_models_with_tag("detection")
    _apply_models(models)


def test_instance_segmentation_models():
    models = _get_models_with_tag("instances")
    _apply_models(models)


def test_semantic_segmentation_models():
    models = _get_models_with_tag("segmentation")
    _apply_models(models)


def test_keypoint_models():
    models = _get_models_with_tag("keypoints")
    _apply_person_keypoint_models(models)


def test_embedding_models():
    all_models = foz.list_zoo_models()
    _apply_embedding_models(all_models)


def test_logits_models():
    models = _get_models_with_tag("logits")
    _apply_models_with_logits(models, store_logits=True)


def test_logits_models_no_logits():
    models = _get_models_with_tag("logits")
    _apply_models_with_logits(models, store_logits=False)


def test_no_confidence_thresh():
    all_models = foz.list_zoo_models()
    _apply_models(
        all_models, confidence_thresh=None, pass_confidence_thresh=True
    )


def test_confidence_thresh():
    all_models = foz.list_zoo_models()
    _apply_models(
        all_models, confidence_thresh=0.5, pass_confidence_thresh=True
    )


def test_batch_size():
    all_models = foz.list_zoo_models()
    _apply_models(all_models, batch_size=5)


def _get_models_with_tag(tag):
    model_names = []
    for model_name in foz.list_zoo_models():
        zoo_model = foz.get_zoo_model(model_name)
        if zoo_model.has_tag(tag):
            model_names.append(model_name)

    return model_names


def _apply_models(
    model_names,
    batch_size=None,
    confidence_thresh=None,
    pass_confidence_thresh=False,
):
    if pass_confidence_thresh:
        kwargs = {"confidence_thresh": confidence_thresh}
    else:
        kwargs = {}

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

        label_field = model_name.lower().replace("-", "_").replace(".", "_")

        dataset.apply_model(
            model, label_field=label_field, batch_size=batch_size, **kwargs
        )

    session = fo.launch_app(dataset)
    session.wait()


def _apply_models_with_logits(model_names, store_logits=True):
    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=1,
    )

    label_fields = []
    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name)

        label_field = model_name.lower().replace("-", "_").replace(".", "_")
        dataset.apply_model(
            model,
            label_field=label_field,
            confidence_thresh=None,
            store_logits=store_logits,
        )
        label_fields.append(label_field)

    for sample in dataset:
        for field in label_fields:
            if store_logits:
                assert sample[field].logits is not None
                assert sample[field].logits.ndim == 1
            else:
                assert sample[field].logits is None


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

    person_samples = dataset.filter_labels(
        "ground_truth", F("label") == "person"
    ).limit(5)

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name)

        label_field = model_name.lower().replace("-", "_").replace(".", "_")
        person_samples.apply_model(model, label_field=label_field)

    session = fo.launch_app(view=person_samples)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
