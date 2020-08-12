"""
Script for evaluating an object detection model using Tensorflow Object
Detection API.

This script expects a persistent dataset can be loaded with FiftyOne and that
said dataset has all necessary fields populated:

    - groundtruth_loc_field_name
    - groundtruth_img_labels_field_name
    - prediction_field_name

Copyright 2017-2020, Voxel51, Inc.
voxel51.com
"""
import argparse
from pathlib import Path
import sys

import fiftyone as fo
from fiftyone import ViewField as F

sys.path.append(str(Path(__file__).resolve().parent.parent))

from error_analysis.evaluation import evaluate_dataset


def main(
    dataset_name,
    label_map_path,
    groundtruth_loc_field_name,
    groundtruth_img_labels_field_name,
    prediction_field_name,
    iou_threshold,
):
    dataset = fo.load_dataset(dataset_name)

    evaluate_dataset(
        dataset=dataset,
        label_map_path=label_map_path,
        groundtruth_loc_field_name=groundtruth_loc_field_name,
        groundtruth_img_labels_field_name=groundtruth_img_labels_field_name,
        prediction_field_name=prediction_field_name,
        iou_threshold=iou_threshold,
    )

    print("Cloning True Positives to a new field...")
    tp_view = dataset.filter_detections(
        prediction_field_name, F("eval") == "true_positive"
    )
    dataset.clone_field(
        prediction_field_name, prediction_field_name + "_TP", tp_view
    )

    print("Cloning False Positives to a new field...")
    fp_view = dataset.filter_detections(
        prediction_field_name, F("eval") == "false_positive"
    )
    dataset.clone_field(
        prediction_field_name, prediction_field_name + "_FP", fp_view
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "dataset_name", help="Name of the dataset in FiftyOne.",
    )
    parser.add_argument(
        "label_map_path", help="Path to the label map .pbtxt file.",
    )

    parser.add_argument(
        "--groundtruth_loc_field_name",
        default="groundtruth_detections",
        help="The name of the groundtruth detections field on the dataset.",
    )
    parser.add_argument(
        "--groundtruth_img_labels_field_name",
        default="groundtruth_image_labels",
        help="The name of the groundtruth image labels (classifications) field"
        " on the dataset.",
    )
    parser.add_argument(
        "--prediction_field_name",
        default="predicted_detections",
        help="The name of the predicted detections field on the dataset.",
    )
    parser.add_argument(
        "--iou_threshold", type=float, default=0.5, help="IOU threhold",
    )
    args = parser.parse_args()

    main(**vars(args))
