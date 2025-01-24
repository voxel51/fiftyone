"""
Evaluation tests.

You must run these tests interactively as follows::

    pytest tests/intensive/evaluation_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import numpy as np

import eta.core.utils as etau
import pytest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


_ANIMALS = [
    "bear",
    "bird",
    "cat",
    "cow",
    "dog",
    "elephant",
    "giraffe",
    "horse",
    "sheep",
    "zebra",
]
_NUM_CLASSES = len(_ANIMALS)
_MISSING = "-"


def test_evaluate_regressions():
    dataset = foz.load_zoo_dataset("quickstart").select_fields().clone()

    for idx, sample in enumerate(dataset, 1):
        ytrue = random.random() * idx
        ypred = ytrue + np.random.randn() * np.sqrt(ytrue)
        confidence = random.random()
        sample["ground_truth"] = fo.Regression(value=ytrue)
        sample["predictions"] = fo.Regression(
            value=ypred, confidence=confidence
        )
        sample["weather"] = random.choice(["sunny", "cloudy", "rainy"])
        sample.save()

    #
    # Simple regression
    #

    results = dataset.evaluate_regressions(
        "predictions", gt_field="ground_truth", eval_key="eval"
    )

    results.print_metrics()

    print(dataset.bounds("eval"))

    plot = results.plot_results(
        labels="weather", sizes="predictions.confidence"
    )
    plot.show()

    input("Press enter to continue...")

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_regressions_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    for sample in dataset:
        for frame_number, frame in sample.frames.items():
            ytrue = random.random() * frame_number
            ypred = ytrue + np.random.randn() * np.sqrt(ytrue)
            confidence = random.random()
            frame["ground_truth"] = fo.Regression(value=ytrue)
            frame["predictions"] = fo.Regression(
                value=ypred, confidence=confidence
            )
            frame["weather"] = random.choice(["sunny", "cloudy", "rainy"])
            frame.save()

        sample.save()

    #
    # Simple regression
    #

    results = dataset.evaluate_regressions(
        "frames.predictions", gt_field="frames.ground_truth", eval_key="eval"
    )

    results.print_metrics()

    print(dataset.bounds("eval"))
    print(dataset.bounds("frames.eval"))

    plot = results.plot_results(
        labels="frames.weather", sizes="frames.predictions.confidence"
    )
    plot.show()

    input("Press enter to continue...")

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_classifications():
    dataset = foz.load_zoo_dataset("imagenet-sample").clone()
    logits_classes = dataset.default_classes

    model = foz.load_zoo_model("resnet50-imagenet-torch")
    dataset.take(25).apply_model(model, "predictions", store_logits=True)

    view = dataset.exists("predictions").set_field(
        "predictions.label", (F("confidence") > 0.9).if_else(F("label"), None)
    )

    # Restrict evaluation to 10 classes, for brevity
    classes = view.distinct("predictions.label")
    classes = classes[:9] + [_MISSING]

    #
    # Simple classification
    #

    SIMPLE_EVAL_KEY = "eval_simple"

    results = view.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key=SIMPLE_EVAL_KEY,
        missing=_MISSING,
    )

    results.print_report()
    results.print_report(classes=classes)

    print(view.count_values(SIMPLE_EVAL_KEY))
    print(view.get_evaluation_info(SIMPLE_EVAL_KEY))

    #
    # Top-k classification
    #

    TOP_K_EVAL_KEY = "eval_top_k"

    top_k_results = view.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key=TOP_K_EVAL_KEY,
        classes=logits_classes,
        missing=_MISSING,
        method="top-k",
        k=5,
    )

    top_k_results.print_report(classes=classes)

    print(view.count_values(TOP_K_EVAL_KEY))
    print(view.get_evaluation_info(TOP_K_EVAL_KEY))

    #
    # Binary classification
    #

    BINARY_EVAL_KEY = "eval_binary"

    neg_label = "other"
    pos_label = view.distinct("predictions.label")[0]

    binarize = (F("label") == pos_label).if_else(F("label"), neg_label)
    binary_view = view.set_field("ground_truth.label", binarize).set_field(
        "predictions.label", binarize
    )

    print(binary_view.count_values("ground_truth.label"))
    print(binary_view.count_values("predictions.label"))

    binary_results = binary_view.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key=BINARY_EVAL_KEY,
        method="binary",
        classes=[neg_label, pos_label],
    )

    binary_results.print_report()

    print(view.count_values(BINARY_EVAL_KEY))
    print(view.get_evaluation_info(BINARY_EVAL_KEY))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_classifications_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    for sample in dataset:
        for frame in sample.frames.values():
            gt_idx = random.randint(0, _NUM_CLASSES - 1)

            logits = np.random.rand(_NUM_CLASSES)
            logits = np.log(logits / np.sum(logits))
            if random.random() < 0.8:
                logits[gt_idx] = 0.0

            gt_label = _ANIMALS[gt_idx]
            pred_label = _ANIMALS[np.argmax(logits)]

            frame["gt_animal"] = fo.Classification(label=gt_label)
            frame["pred_animal"] = fo.Classification(
                label=pred_label, logits=logits
            )

        sample.save()

    #
    # Simple classification
    #

    SIMPLE_EVAL_KEY = "eval_simple"

    results = dataset.evaluate_classifications(
        "frames.pred_animal",
        gt_field="frames.gt_animal",
        eval_key=SIMPLE_EVAL_KEY,
    )

    results.print_report()

    print(dataset.bounds(SIMPLE_EVAL_KEY))
    print(dataset.count_values("frames." + SIMPLE_EVAL_KEY))
    print(dataset.get_evaluation_info(SIMPLE_EVAL_KEY))

    #
    # Top-k classification
    #

    TOP_K_EVAL_KEY = "eval_top_k"

    top_k_results = dataset.evaluate_classifications(
        "frames.pred_animal",
        gt_field="frames.gt_animal",
        eval_key=TOP_K_EVAL_KEY,
        method="top-k",
        classes=_ANIMALS,
        k=2,
    )

    top_k_results.print_report()

    print(dataset.bounds(TOP_K_EVAL_KEY))
    print(dataset.count_values("frames." + TOP_K_EVAL_KEY))
    print(dataset.get_evaluation_info(TOP_K_EVAL_KEY))

    #
    # Binary classification
    #

    BINARY_EVAL_KEY = "eval_binary"

    binarize = (F("label") == "cat").if_else(F("label"), "other")
    binary_view = dataset.set_field(
        "frames.gt_animal.label", binarize
    ).set_field("frames.pred_animal.label", binarize)

    print(binary_view.count_values("frames.gt_animal.label"))
    print(binary_view.count_values("frames.pred_animal.label"))

    binary_results = binary_view.evaluate_classifications(
        "frames.pred_animal",
        gt_field="frames.gt_animal",
        eval_key=BINARY_EVAL_KEY,
        method="binary",
        classes=["other", "cat"],
    )

    binary_results.print_report()

    print(dataset.bounds(BINARY_EVAL_KEY))
    print(dataset.count_values("frames." + BINARY_EVAL_KEY))
    print(dataset.list_evaluations())
    print(dataset.get_evaluation_info(BINARY_EVAL_KEY))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_detections():
    dataset = foz.load_zoo_dataset("quickstart").clone()

    classes = dataset.distinct("predictions.detections.label")
    classes = classes[:9] + [_MISSING]

    view = dataset.set_field(
        "predictions.detections.label",
        (F("confidence") > 0.9).if_else(F("label"), None),
    )

    #
    # COCO evaluation
    #

    EVAL_KEY = "eval_coco"

    results = view.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key=EVAL_KEY,
        missing=_MISSING,
        method="coco",
    )

    results.print_report(classes=classes)

    print(dataset.bounds(EVAL_KEY + "_tp"))
    print(dataset.bounds(EVAL_KEY + "_fp"))
    print(dataset.bounds(EVAL_KEY + "_fn"))
    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Customized COCO evaluation
    #

    results = view.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key=EVAL_KEY,
        missing=_MISSING,
        method="coco",
        iou=0.5,
        classwise=False,
    )

    results.print_report(classes=classes)

    print(dataset.bounds(EVAL_KEY + "_tp"))
    print(dataset.bounds(EVAL_KEY + "_fp"))
    print(dataset.bounds(EVAL_KEY + "_fn"))
    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Open Images evaluation
    #

    EVAL_KEY = "eval_oi"

    results = view.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key=EVAL_KEY,
        missing=_MISSING,
        method="open-images",
    )

    results.print_report(classes=classes)

    print(dataset.bounds(EVAL_KEY + "_tp"))
    print(dataset.bounds(EVAL_KEY + "_fp"))
    print(dataset.bounds(EVAL_KEY + "_fn"))
    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Customized Open Images evaluation
    #

    results = view.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key=EVAL_KEY,
        missing=_MISSING,
        method="open-images",
        iou=0.5,
        classwise=False,
    )

    results.print_report(classes=classes)

    print(dataset.bounds(EVAL_KEY + "_tp"))
    print(dataset.bounds(EVAL_KEY + "_fp"))
    print(dataset.bounds(EVAL_KEY + "_fn"))
    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_polygons():
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        label_types=["detections", "segmentations"],
        max_samples=50,
        drop_existing_dataset=True,
    )

    # pylint: disable=no-member
    def jitter(labels, delta=None, uniform=True):
        if isinstance(labels, fo.Detections):
            for detection in labels.detections:
                alpha = random.random()
                bounding_box = np.array(detection.bounding_box)

                if uniform:
                    bounding_box += alpha * delta * np.array([1, 1, 0, 0])
                else:
                    bounding_box += alpha * delta * np.random.random(4)

                detection.bounding_box = bounding_box.tolist()
                detection.confidence = alpha

        if isinstance(labels, fo.Polylines):
            for polyline in labels.polylines:
                alpha = random.random()
                points = []
                for _points in polyline.points:
                    _points = np.array(_points)

                    if uniform:
                        _points += alpha * delta * np.ones(_points.shape)
                    else:
                        _points += (
                            alpha * delta * np.random.random(_points.shape)
                        )

                    points.append(_points.tolist())

                polyline.points = points
                polyline.confidence = alpha

        return labels

    # Add polylines
    with fo.ProgressBar() as pb:
        for sample in pb(dataset):
            sample["polylines"] = sample["segmentations"].to_polylines()
            sample.save()

    # doesn't create self-intersecting polygons
    # jit = lambda labels: jitter(labels, delta=0.03, uniform=True)

    # likely creates self-intersecting polylines
    jit = lambda labels: jitter(labels, delta=0.05, uniform=False)

    # Add predictions
    with fo.ProgressBar() as pb:
        for sample in pb(dataset):
            sample["pred_det"] = jit(sample["detections"].copy())
            sample["pred_seg"] = jit(sample["segmentations"].copy())
            sample["pred_pol"] = jit(sample["polylines"].copy())
            sample.save()

    results1 = dataset.evaluate_detections(
        "pred_det", gt_field="detections", eval_key="det_coco", method="coco"
    )
    print(results1.metrics())

    results2 = dataset.evaluate_detections(
        "pred_seg",
        gt_field="segmentations",
        eval_key="seg_coco",
        method="coco",
        use_masks=True,
    )
    print(results2.metrics())

    results3 = dataset.evaluate_detections(
        "pred_pol", gt_field="polylines", eval_key="pol_coco", method="coco"
    )
    print(results3.metrics())

    results4 = dataset.evaluate_detections(
        "pred_pol",
        gt_field="polylines",
        eval_key="pol_coco",
        method="coco",
        use_boxes=True,
    )
    print(results4.metrics())

    results1 = dataset.evaluate_detections(
        "pred_det",
        gt_field="detections",
        eval_key="det_oi",
        method="open-images",
    )
    print(results1.metrics())

    results2 = dataset.evaluate_detections(
        "pred_seg",
        gt_field="segmentations",
        eval_key="seg_oi",
        method="open-images",
        use_masks=True,
    )
    print(results2.metrics())

    results3 = dataset.evaluate_detections(
        "pred_pol",
        gt_field="polylines",
        eval_key="pol_oi",
        method="open-images",
    )
    print(results3.metrics())

    results4 = dataset.evaluate_detections(
        "pred_pol",
        gt_field="polylines",
        eval_key="pol_oi",
        method="open-images",
        use_boxes=True,
    )
    print(results4.metrics())


def test_evaluate_detections_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.clone_frame_field("detections", "predictions")

    classes = dataset.distinct("frames.detections.detections.label")

    def jitter(val):
        if isinstance(val, list):
            return [jitter(v) for v in val]

        if random.random() < 0.90:
            return val

        return random.choice(classes)

    values = dataset.values("frames.detections.detections.label")
    dataset.set_values("frames.predictions.detections.label", jitter(values))

    print(dataset.count_values("frames.detections.detections.label"))
    print(dataset.count_values("frames.predictions.detections.label"))

    #
    # COCO evaluation
    #

    EVAL_KEY = "eval_coco"

    results = dataset.evaluate_detections(
        "frames.predictions",
        gt_field="frames.detections",
        eval_key=EVAL_KEY,
    )

    results.print_report()

    print(dataset.bounds(EVAL_KEY + "_tp"))
    print(dataset.bounds(EVAL_KEY + "_fp"))
    print(dataset.bounds(EVAL_KEY + "_fn"))

    print(dataset.bounds("frames." + EVAL_KEY + "_tp"))
    print(dataset.bounds("frames." + EVAL_KEY + "_fp"))
    print(dataset.bounds("frames." + EVAL_KEY + "_fn"))

    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


@pytest.mark.parametrize("compute_dice", [True, False])
def test_evaluate_segmentations(compute_dice):
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        max_samples=10,
        shuffle=True,
    ).clone()

    # These are the VOC classes
    CLASSES = [
        "background",
        "aeroplane",
        "bicycle",
        "bird",
        "boat",
        "bottle",
        "bus",
        "car",
        "cat",
        "chair",
        "cow",
        "diningtable",
        "dog",
        "horse",
        "motorbike",
        "person",
        "pottedplant",
        "sheep",
        "sofa",
        "train",
        "tvmonitor",
    ]

    MASK_TARGETS = {idx: label for idx, label in enumerate(CLASSES)}

    model = foz.load_zoo_model("deeplabv3-resnet50-coco-torch")
    dataset.apply_model(model, "resnet50")

    model = foz.load_zoo_model("deeplabv3-resnet101-coco-torch")
    dataset.apply_model(model, "resnet101")

    #
    # Full evaluation
    #

    EVAL_KEY = "eval_resnet"

    results = dataset.evaluate_segmentations(
        "resnet50",
        gt_field="resnet101",
        eval_key=EVAL_KEY,
        mask_targets=MASK_TARGETS,
        compute_dice=compute_dice,
    )

    results.print_report()

    print(dataset.bounds("%s_accuracy" % EVAL_KEY))
    print(dataset.bounds("%s_precision" % EVAL_KEY))
    print(dataset.bounds("%s_recall" % EVAL_KEY))
    if compute_dice:
        print(dataset.bounds("%s_dice" % EVAL_KEY))
        dice = results.dice_score()
        assert 0 < dice <= 1
    else:
        assert dataset.has_field("%s_dice" % EVAL_KEY) is False

    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Bandwidth evaluation
    #

    EVAL_KEY_BW = "eval_resnet_bw"

    results = dataset.evaluate_segmentations(
        "resnet50",
        gt_field="resnet101",
        eval_key=EVAL_KEY_BW,
        mask_targets=MASK_TARGETS,
        bandwidth=5,
    )

    results.print_report()

    print(dataset.bounds("%s_accuracy" % EVAL_KEY_BW))
    print(dataset.bounds("%s_precision" % EVAL_KEY_BW))
    print(dataset.bounds("%s_recall" % EVAL_KEY_BW))
    print(dataset.get_evaluation_info(EVAL_KEY_BW))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_evaluate_segmentations_on_disk():
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        max_samples=10,
        shuffle=True,
    ).clone()

    # These are the VOC classes
    CLASSES = [
        "background",
        "aeroplane",
        "bicycle",
        "bird",
        "boat",
        "bottle",
        "bus",
        "car",
        "cat",
        "chair",
        "cow",
        "diningtable",
        "dog",
        "horse",
        "motorbike",
        "person",
        "pottedplant",
        "sheep",
        "sofa",
        "train",
        "tvmonitor",
    ]

    MASK_TARGETS = {idx: label for idx, label in enumerate(CLASSES)}

    # Store segmentations on disk rather than in-database
    etau.ensure_empty_dir("/tmp/resnet50", cleanup=True)
    model = foz.load_zoo_model("deeplabv3-resnet50-coco-torch")
    dataset.apply_model(model, "resnet50", output_dir="/tmp/resnet50")
    print(dataset.values("resnet50.mask_path"))

    # Store segmentations on disk rather than in-database
    etau.ensure_empty_dir("/tmp/resnet101", cleanup=True)
    model = foz.load_zoo_model("deeplabv3-resnet101-coco-torch")
    dataset.apply_model(model, "resnet101", output_dir="/tmp/resnet101")
    print(dataset.values("resnet101.mask_path"))

    #
    # Full evaluation
    #

    EVAL_KEY = "eval_resnet"

    results = dataset.evaluate_segmentations(
        "resnet50",
        gt_field="resnet101",
        eval_key=EVAL_KEY,
        mask_targets=MASK_TARGETS,
    )

    results.print_report()

    print(dataset.bounds("%s_accuracy" % EVAL_KEY))
    print(dataset.bounds("%s_precision" % EVAL_KEY))
    print(dataset.bounds("%s_recall" % EVAL_KEY))
    print(dataset.get_evaluation_info(EVAL_KEY))

    #
    # Bandwidth evaluation
    #

    EVAL_KEY_BW = "eval_resnet_bw"

    results = dataset.evaluate_segmentations(
        "resnet50",
        gt_field="resnet101",
        eval_key=EVAL_KEY_BW,
        mask_targets=MASK_TARGETS,
        bandwidth=5,
    )

    results.print_report()

    print(dataset.bounds("%s_accuracy" % EVAL_KEY_BW))
    print(dataset.bounds("%s_precision" % EVAL_KEY_BW))
    print(dataset.bounds("%s_recall" % EVAL_KEY_BW))
    print(dataset.get_evaluation_info(EVAL_KEY_BW))

    #
    # Cleanup
    #

    dataset.delete_evaluations()


def test_classification_results():
    ytrue = ["cat", "cat", "dog", "dog", "fox", "fox"]
    ypred = ["cat", "dog", "dog", "fox", "fox", "cat"]

    samples = []
    for i, (yt, yp) in enumerate(zip(ytrue, ypred)):
        sample = fo.Sample(
            filepath="image%d.jpg" % i,
            ground_truth=fo.Classification(label=yt),
            predictions=fo.Classification(label=yp),
        )
        samples.append(sample)

    dataset = fo.Dataset()
    dataset.add_samples(samples)

    results = dataset.evaluate_classifications("predictions")

    # Includes all 3 classes
    results.print_report()

    # Includes all 3 classes
    plot = results.plot_confusion_matrix()
    plot.show()

    classes = ["cat", "dog"]

    # Shows per-class metrics for only `cat` and `dog` classes, but other
    # predictions when GT=cat/dog are taken into account for P/R/F1 scores
    results.print_report(classes=classes)

    # Only include `cat` and `dog` rows (GT); associated non-cat/dog
    # predictions are captured in an "other" column
    plot = results.plot_confusion_matrix(classes=classes)
    plot.show()

    # Only include `cat` and `dog` rows (GT) and columns (predictions)
    plot = results.plot_confusion_matrix(classes=classes, include_other=False)
    plot.show()

    input("Press enter to continue...")


def test_classification_results_missing_data():
    ytrue = ["cat", "cat", "cat", "dog", "dog", "dog", "fox", "fox", "fox"]
    ypred = ["cat", "dog", None, "dog", "fox", None, "fox", "cat", None]

    samples = []
    for i, (yt, yp) in enumerate(zip(ytrue, ypred)):
        sample = fo.Sample(
            filepath="image%d.jpg" % i,
            ground_truth=fo.Classification(label=yt),
            predictions=fo.Classification(label=yp),
        )
        samples.append(sample)

    dataset = fo.Dataset()
    dataset.add_samples(samples)

    results = dataset.evaluate_classifications("predictions")

    # No row for "missing" GT labels, since these entires represent false
    # positive predictions
    results.print_report()

    # Data includes missing GT/preds, so includes a "none" row/column when
    # plotting confusion matrix
    plot = results.plot_confusion_matrix()
    plot.show()

    classes = ["cat", "dog"]

    # Shows per-class metrics for only `cat` and `dog` classes, but other
    # predictions when GT=cat/dog are taken into account for P/R/F1 scores
    results.print_report(classes=classes)

    # Shows per-class metrics for only `cat` and `dog` classes, but other
    # predictions when GT=cat/dog are taken into account for P/R/F1 scores
    plot = results.plot_confusion_matrix(classes=classes)
    plot.show()

    # Only include `cat` and `dog` rows (GT) and columns (predictions)
    plot = results.plot_confusion_matrix(classes=classes, include_other=False)
    plot.show()

    input("Press enter to continue...")


def test_detection_results():
    dataset = foz.load_zoo_dataset("quickstart")

    results = dataset.evaluate_detections("predictions", classwise=False)

    # Get the 10 most common classes in the dataset
    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    # Should show only per-class metrics for the specified classes, but other
    # predictions not in `classes` for GTs that are in `classes` should be
    # taken into account for P/R/F1 scores
    results.print_report(classes=classes)

    # Should contain "other" and "none" columns
    plot = results.plot_confusion_matrix(classes=classes)
    plot.show()

    # Should not contain "other" or "none" columns
    plot = results.plot_confusion_matrix(classes=classes, include_other=False)
    plot.show()

    # Should contain "other" and "none" columns, as well as a "none" row
    plot = results.plot_confusion_matrix(classes=classes + [results.missing])
    plot.show()

    # Should contain "none" row and columns
    plot = results.plot_confusion_matrix(
        classes=classes + [results.missing], include_other=False
    )
    plot.show()

    input("Press enter to continue...")


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
