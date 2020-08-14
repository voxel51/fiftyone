"""
Script for running object detection inference on a directory of images using
a pre-trained Tensorflow Hub detector and saving to CSV in either:

    - Tensorflow Object Detection API format
    - Open Images Kaggle Competition format

Copyright 2017-2020, Voxel51, Inc.
voxel51.com
"""
import argparse
import glob
from pathlib import Path
import sys

import pandas as pd
import tensorflow as tf

sys.path.append(str(Path(__file__).resolve().parent.parent))

from error_analysis.inference.tfhub import (
    TensorFlowHubDetector,
    detections_to_csv,
)


def main(
    images_dir,
    model_handle,
    output_dir,
    output_format="tf_object_detection_api",
    save_every=10,
):
    # get list of paths to images
    imgs_pattern = str(Path(images_dir).joinpath("*.jpg"))
    img_paths = glob.glob(imgs_pattern)

    assert len(img_paths), "No images found in dir: %s" % images_dir

    # specify output path
    model_name = (
        model_handle.lstrip("https://tfhub.dev/")
        .rstrip("/1")
        .replace("/", "-")
    )
    output_predictions_path = Path(output_dir).joinpath(
        "%s_predictions.csv" % model_name
    )

    if Path(output_predictions_path).exists():
        df = pd.read_csv(output_predictions_path)
        processed_image_ids = set(df["ImageID"])
    else:
        processed_image_ids = set()

    # load detector
    print("Loading model '%s'..." % model_name)
    detector = TensorFlowHubDetector(model_handle=model_handle)
    print("Model successfully loaded.")
    print("Generating predictions and saving every %d samples." % save_every)
    print(
        "This program is resumable and will continue from where it has left"
        "off if terminated."
    )

    # generate predictions
    detections = {}
    pbar = tf.keras.utils.Progbar(len(img_paths))
    for idx, img_path in enumerate(img_paths):
        image_id = Path(img_path).stem

        if image_id in processed_image_ids:
            # skip already-processed images
            continue

        detections[image_id] = detector.detect(img_path)

        pbar.update(idx)

        if idx % save_every == 0 and detections:
            detections_to_csv(
                detections, output_predictions_path, format=output_format
            )
            detections = {}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "images_dir",
        help="Directory where images are stored. Images should be in"
        " <open-images-id>.jpg format",
    )
    parser.add_argument(
        "model_handle", help="URL to the tensorflow hub model",
    )
    parser.add_argument(
        "--output_dir",
        default=".",
        help="Directory to output the predictions to",
    )
    parser.add_argument(
        "--output_format",
        default="tf_object_detection_api",
        help="CSV output format. Either 'tf_object_detection_api'"
        " (Tensorflow Object Detection API) or 'oi_kaggle'"
        " (Open Images Kaggle Competition)",
    )
    parser.add_argument(
        "--save_every",
        default=10,
        type=int,
        help="How often to append the output to CSV",
    )
    args = parser.parse_args()

    main(**vars(args))
