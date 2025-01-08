"""
Model zoo tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/model_zoo_tests.py -s -k test_<name>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


_SAM_PROMPT_FIELD = "prompt_field"


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


def test_sam_boxes():
    models = ["segment-anything-vitb-torch"]
    _apply_models(
        models,
        max_samples=3,
        batch_size=2,
        apply_kwargs={_SAM_PROMPT_FIELD: "ground_truth"},
    )


def test_sam_points():
    models = ["segment-anything-vitb-torch"]
    _apply_models(
        models,
        max_samples=3,
        batch_size=2,
        model_kwargs=dict(mask_index=1.05),
        apply_kwargs={_SAM_PROMPT_FIELD: "ground_truth"},
        prompt_type="keypoints",
    )


def test_sam_auto():
    models = ["segment-anything-vitb-torch"]
    _apply_models(
        models,
        max_samples=3,
        model_kwargs=dict(pred_iou_thresh=0.9, min_mask_region_area=200),
    )


def test_sam2_boxes():
    models = ["segment-anything-2-hiera-tiny-image-torch"]
    _apply_models(
        models,
        max_samples=3,
        batch_size=2,
        apply_kwargs={_SAM_PROMPT_FIELD: "ground_truth"},
    )


def test_sam2_points():
    models = ["segment-anything-2-hiera-tiny-image-torch"]
    _apply_models(
        models,
        max_samples=3,
        batch_size=2,
        model_kwargs=dict(mask_index=1.05),
        apply_kwargs={_SAM_PROMPT_FIELD: "ground_truth"},
        prompt_type="keypoints",
    )


def test_sam2_auto():
    models = ["segment-anything-2-hiera-tiny-image-torch"]
    _apply_models(
        models,
        max_samples=3,
    )


def test_sam2_video():
    models = ["segment-anything-2-hiera-tiny-video-torch"]
    _apply_video_models(
        models,
        max_samples=2,
        apply_kwargs={_SAM_PROMPT_FIELD: "frames.detections"},
    )


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


def test_zero_shot_labels():
    models = _get_models_with_tag("zero-shot")
    _apply_zero_shot_models(models)


def _get_models_with_tag(tag):
    model_names = []
    for model_name in foz.list_zoo_models():
        zoo_model = foz.get_zoo_model(model_name)
        if zoo_model.has_tag(tag):
            model_names.append(model_name)

    return model_names


def _detections_to_keypoints(detection_list):
    keypoints = []
    for detection in detection_list:
        n_points = random.randint(1, 5)
        x1, y1, w, h = detection.bounding_box
        rand_point = lambda: (
            random.uniform(x1, x1 + w),
            random.uniform(y1, y1 + h),
        )
        points = [rand_point() for _ in range(n_points)]
        keypoint = fo.Keypoint(points=points, label=detection.label)
        keypoints.append(keypoint)

    return fo.Keypoints(keypoints=keypoints)


def _apply_models(
    model_names,
    batch_size=None,
    confidence_thresh=None,
    pass_confidence_thresh=False,
    max_samples=10,
    prompt_type=None,
    model_kwargs=None,
    apply_kwargs=None,
):
    if pass_confidence_thresh:
        kwargs = {"confidence_thresh": confidence_thresh}
    else:
        kwargs = {}

    if apply_kwargs:
        kwargs.update(apply_kwargs)

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=max_samples,
    )

    # Generate keypoints for segment-anything model
    if _SAM_PROMPT_FIELD in kwargs:
        if prompt_type == "keypoints":
            field_name = kwargs[_SAM_PROMPT_FIELD]
            kp_field_name = field_name + "_points"
            detections = dataset.values(field_name + ".detections")
            keypoints = [_detections_to_keypoints(d) for d in detections]
            dataset.set_values(kp_field_name, keypoints)
            kwargs[_SAM_PROMPT_FIELD] = kp_field_name

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name, **(model_kwargs or {}))

        label_field = model_name.lower().replace("-", "_").replace(".", "_")

        dataset.apply_model(
            model, label_field=label_field, batch_size=batch_size, **kwargs
        )

    session = fo.launch_app(dataset)
    session.wait()


def _apply_video_models(
    model_names,
    batch_size=None,
    confidence_thresh=None,
    pass_confidence_thresh=False,
    max_samples=10,
    model_kwargs=None,
    apply_kwargs=None,
):
    if pass_confidence_thresh:
        kwargs = {"confidence_thresh": confidence_thresh}
    else:
        kwargs = {}

    if apply_kwargs:
        kwargs.update(apply_kwargs)

    dataset = foz.load_zoo_dataset(
        "quickstart-video",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=max_samples,
    )

    if _SAM_PROMPT_FIELD in kwargs:
        dataset.match_frames(F("frame_number" > 1)).set_field(
            "frames.detections", None
        ).save()

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name, **(model_kwargs or {}))

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


def _apply_zero_shot_models(model_names):
    # Load a small test dataset
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        shuffle=True,
        max_samples=10,
    )
    custom_labels = dataset.distinct("ground_truth.detections.label")

    for idx, model_name in enumerate(model_names, 1):
        print(
            "Running model %d/%d: '%s'" % (idx, len(model_names), model_name)
        )

        model = foz.load_zoo_model(model_name, class_labels=custom_labels)

        label_field = model_name.lower().replace("-", "_").replace(".", "_")

        dataset.apply_model(model, label_field=label_field, batch_size=4)

        assert len(dataset.exists(label_field)) == len(dataset)
        assert all(
            [
                label in custom_labels
                for label in dataset.distinct(f"{label_field}.label")
            ]
        )


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
