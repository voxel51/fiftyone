"""
Tensorflow Hub Object Detection

Copyright 2017-2020, Voxel51, Inc.
voxel51.com
"""
import csv
from pathlib import Path

from PIL import Image
import tensorflow as tf
import tensorflow_hub as hub


class TensorFlowHubDetector:
    """Object Detector wrapper class that simplifies use of TF Hub models."""

    def __init__(self, model_handle):
        """Initializes the detector.

        Args:
            model_handle: url to the model, starting with: https://tfhub.dev/
        """
        self.model_handle = model_handle
        self._detector = hub.load(self.model_handle).signatures["default"]

    def detect(self, img_or_path, reshape_output=True):
        """Runs inference on a single image.

        Args:
             img_or_path: image tensor or path to image on disk
             reshape_output: whether to reshape to a list of detection
                dictionaries or return the default model output dictionary

        Returns:
            (reshape_output=True) list of detection dictionaries of format:
                [
                    {
                        'Class Entity': b'Food',
                        'Class Label': 193,
                        'Class Name': b'/m/02wbm',
                        'Confidence': 0.70297146,
                        'XMax': 0.75722724,
                        'XMin': 0.028522551,
                        'YMax': 0.9316236,
                        'YMin': 2.9873252e-06,
                    },
                    {
                        'Class Entity': b'Food',
                        'Class Label': 193,
                        'Class Name': b'/m/02wbm',
                        'Confidence': 0.30363163,
                        'XMax': 0.9926388,
                        'XMin': 0.36288354,
                        'YMax': 0.97807735,
                        'YMin': 0.01982515,
                    },
                    ...
                ]

            (reshape_output=False) a dictionary of format:
                {
                    'detection_scores':         ...,
                    'detection_class_labels':   ...,
                    'detection_class_entities': ...,
                    'detection_class_names':    ...,
                    'detection_boxes':          ...,
                }
        """
        if isinstance(img_or_path, str):
            img = self._load_image(img_or_path)
        else:
            img = img_or_path

        detector_output = self._detector(img)
        detector_output = {
            key: value.numpy() for key, value in detector_output.items()
        }

        if reshape_output:
            return self._reshape_output(detector_output)

        return detector_output

    @staticmethod
    def _load_image(img_path):
        pil_image = Image.open(img_path)

        pil_image_rgb = pil_image.convert("RGB")
        img = tf.keras.preprocessing.image.img_to_array(
            pil_image_rgb, dtype="uint8"
        )
        img = tf.image.convert_image_dtype(img, tf.float32)[tf.newaxis, ...]

        return img

    @staticmethod
    def _reshape_output(detector_output):
        # integer labels
        class_labels = detector_output["detection_class_labels"]
        # MID labels
        class_names = detector_output["detection_class_names"]
        # human interpretable labels
        class_entities = detector_output["detection_class_entities"]
        scores = detector_output["detection_scores"]
        boxes = detector_output["detection_boxes"]

        detections = []
        for i in range(len(class_labels)):
            ymin, xmin, ymax, xmax = boxes[i, :]
            detections.append(
                {
                    "Class Label": class_labels[i],
                    "Class Name": class_names[i],
                    "Class Entity": class_entities[i],
                    "Confidence": scores[i],
                    "XMin": xmin,
                    "XMax": xmax,
                    "YMin": ymin,
                    "YMax": ymax,
                }
            )

        return detections


def detections_to_csv(
    detections, output_path, format="tf_object_detection_api"
):
    """Writes the detections to a CSV file.

    FORMAT: "tf_object_detection_api" (Tensorflow Object Detection API)

        Output file structure will have a single header row followed by one row
        per detection as follows:

            ImageID,LabelName,Score,XMin,XMax,YMin,YMax
            ...,...,...,...,...,...,...
            ...,...,...,...,...,...,...

        Example output for two images with two detections each:

            ImageID,LabelName,Score,XMin,XMax,YMin,YMax
            000026e7ee790996,/m/07j7r,0.1,0.071905,0.145346,0.206591,0.391306
            000026e7ee790996,/m/07j7r,0.2,0.439756,0.572466,0.264153,0.435122
            000062a39995e348,/m/015p6,0.4,0.205719,0.849912,0.154144,1.000000
            000062a39995e348,/m/05s2s,0.5,0.137133,0.377634,0.000000,0.884185

    FORMAT: "oi_kaggle" (Open Images Kaggle Competition)

        Output file structure will have a single header row followed by one row
        per image as follows:

            ImageID,PredictionString
            ImageID,{Label Confidence XMin YMin XMax YMax} {...}

        Example output for two images with two detections each:

            ImageID,PredictionString
            b5d912e06f74e948,/m/05s2s 0.9 0.46 0.08 0.93 0.5 /m/0c9ph5 0.5 0.25 0.6 0.6 0.9
            be137cf6bb0b62d5,/m/05s2s 0.9 0.46 0.08 0.93 0.5 /m/0c9ph5 0.5 0.25 0.6 0.6 0.9

    Args:
        detections: reshaped output list of detection dicts output from
            TensorFlowHubDetector.detect()
        output_path: the CSV filepath to write to
        format:
            either "tf_object_detection_api" or "oi_kaggle"
            "tf_object_detection_api": Tensorflow Object Detection API format
            "oi_kaggle": open images kaggle competition format
    """
    if format == "oi_kaggle":
        _detections_to_csv_oi_kaggle(
            detections=detections, output_path=output_path
        )
    elif format == "tf_object_detection_api":
        _detections_to_csv_tf_obj_det(
            detections=detections, output_path=output_path
        )
    else:
        raise ValueError("Unknown CSV output format: %s" % format)


def _detections_to_csv_oi_kaggle(detections, output_path):
    write_header = not Path(output_path).exists()

    with open(output_path, "a") as csvfile:
        writer = csv.writer(csvfile)

        # write header
        if write_header:
            writer.writerow(["ImageID", "PredictionString"])

        for image_id, cur_dets in detections.items():
            preds_str = " ".join(
                [
                    " ".join(
                        [
                            det["Class Name"].decode("utf-8"),
                            "%.4f" % det["Confidence"],
                            "%.4f" % det["XMin"],
                            "%.4f" % det["YMin"],
                            "%.4f" % det["XMax"],
                            "%.4f" % det["YMax"],
                        ]
                    )
                    for det in cur_dets
                ]
            )

            writer.writerow([image_id, preds_str])


def _detections_to_csv_tf_obj_det(detections, output_path):
    write_header = not Path(output_path).exists()

    with open(output_path, "a") as csvfile:
        writer = csv.writer(csvfile)

        # write header
        if write_header:
            writer.writerow(
                [
                    "ImageID",
                    "LabelName",
                    "Score",
                    "XMin",
                    "XMax",
                    "YMin",
                    "YMax",
                ]
            )

        for image_id, cur_dets in detections.items():
            for det in cur_dets:
                writer.writerow(
                    [
                        image_id,  # ImageID
                        det["Class Name"].decode("utf-8"),  # LabelName
                        "%.4f" % det["Confidence"],  # Score
                        "%.4f" % det["XMin"],  # XMin
                        "%.4f" % det["XMax"],  # XMax
                        "%.4f" % det["YMin"],  # YMin
                        "%.4f" % det["YMax"],  # YMax
                    ]
                )
