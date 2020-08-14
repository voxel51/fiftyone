"""
Script for loading Google's Open Images dataset into FiftyOne and saving as a
persistent Dataset.

Copyright 2017-2020, Voxel51, Inc.
voxel51.com
"""
import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))

from error_analysis.load_data import load_open_images_dataset


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "dataset_name", help="Name of the dataset to create in FiftyOne.",
    )
    parser.add_argument(
        "images_dir",
        help="Directory where images are stored. Images should be in"
        " <open-images-id>.jpg format",
    )
    parser.add_argument(
        "--bounding_boxes_path",
        default=None,
        help="Path to the expanded-hierarchy annotation bounding boxes CSV.",
    )
    parser.add_argument(
        "--image_labels_path",
        default=None,
        help="Path to the expanded-hierarchy annotation image labels CSV.",
    )
    parser.add_argument(
        "--predictions_path",
        default=None,
        help="Path to the predicted bounding boxes CSV.",
    )
    parser.add_argument(
        "--prediction_field_name",
        default="predicted_detections",
        help="The name of the field to save the predictions under. Useful if"
        " other predictions may be added later.",
    )
    parser.add_argument(
        "--class_descriptions_path",
        default=None,
        help="Path to the MID-to-Short-Description class name mapping CSV.",
    )
    parser.add_argument(
        "--load_images_with_preds",
        action="store_true",
        default=False,
        help="If specified, only samples with predictions are added to the"
        " dataset. Useful if predictions were only generated on a subset"
        " of images.",
    )
    parser.add_argument(
        "--max_num_images",
        default=-1,
        type=int,
        help="Maximum number of images to load. -1 implies load all images.",
    )
    args = parser.parse_args()

    dataset = load_open_images_dataset(**vars(args))

    dataset.persistent = True

    print(dataset)
