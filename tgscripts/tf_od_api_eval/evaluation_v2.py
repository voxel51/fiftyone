""""""
import logging
import os
import six

import numpy as np
import pandas as pd
from google.protobuf import text_format

import sys

sys.path.append("/Users/tylerganter/source/theta/tensorflow/models/research")

from object_detection.metrics import io_utils
from object_detection.metrics import oid_challenge_evaluation_utils as utils
from object_detection.protos import string_int_label_map_pb2
from object_detection.utils import object_detection_evaluation
from object_detection.core import standard_fields


###############################################################################

HIERARCHY_FILE = "/Users/tylerganter/data/open-images-dataset/v4/bbox_labels_600_hierarchy.json"
BOUNDING_BOXES = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions.csv"
CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"
OUTPUT_METRICS = "output_metrics.csv"

###############################################################################


def get_mAP(eval_result):
    keys = [key for key in eval_result if "mAP" in key]
    assert len(keys) == 1, "unexpected number of mAP keys: %d" % len(keys)
    return eval_result[keys[0]]


def get_class_AP(eval_result, label_name):
    keys = [key for key in eval_result if label_name in key]
    assert len(keys) == 1, "unexpected number of keys: %d" % len(keys)
    return eval_result[keys[0]]


class Evaluator:
    def __init__(self, class_label_map_path):
        """
        Args:
            class_label_map_path: path to the label map .pbtxt file
        """
        self._class_label_map, self._categories = _load_labelmap(
            class_label_map_path
        )
        self._reverse_label_map = {
            v: k for k, v in self._class_label_map.items()
        }

        self._evaluator = object_detection_evaluation.OpenImagesChallengeEvaluator(
            self._categories, evaluate_masks=False
        )

    def evaluate_image(self, groundtruth, predictions):
        """

        Args:
            groundtruth: pandas.DataFrame with columns:
                'ImageID', 'Source', 'LabelName', 'Confidence',
                'XMin', 'XMax', 'YMin', 'YMax',
                'IsOccluded', 'IsTruncated', 'IsGroupOf', 'IsDepiction',
                'IsInside', 'ConfidenceImageLabel'
            predictions: pandas.DataFrame with columns:
                'ImageID', 'LabelName', 'Score', 'XMin', 'XMax', 'YMin', 'YMax'

        Returns:

        """
        # add data to evaluator
        groundtruth_dict = utils.build_groundtruth_dictionary(
            groundtruth, self._class_label_map
        )
        prediction_dict = utils.build_predictions_dictionary(
            predictions, self._class_label_map
        )
        self._evaluator.add_single_ground_truth_image_info(
            image_id, groundtruth_dict
        )
        self._evaluator.add_single_detected_image_info(
            image_id, prediction_dict
        )

        # guarantee the evaluator is cleared
        try:
            # actually evaluate the image
            result = self._evaluate_image(predictions, prediction_dict)
        finally:
            self._evaluator.clear()

        return result

    def _evaluate_image(self, predictions, prediction_dict):
        state, _ = self._evaluator.get_internal_state()
        tp_idxs, fp_idxs = self._get_TP_FP(state, predictions, prediction_dict)
        print("TP idxs: ", tp_idxs)
        print("FP idxs: ", fp_idxs)

        assert False, "ASDF"

        eval_result = self._evaluator.evaluate()
        print("mAP: ", get_mAP(eval_result))
        for i in range(60, 80):
            label_name = self._categories[i]["name"]
            print(
                "%s AP: " % label_name, get_class_AP(eval_result, label_name)
            )

    def _get_TP_FP(self, state, predictions, prediction_dict):
        """
            state.scores_per_class
            state.tp_fp_labels_per_class

            groundtruth_dict['groundtruth_classes']
            groundtruth_dict['groundtruth_boxes']
            groundtruth_dict['groundtruth_group_of']
            groundtruth_dict['groundtruth_image_classes']

            prediction_dict['detection_classes']
            prediction_dict['detection_scores']
            prediction_dict['detection_boxes']


        USELESS?
            state.num_gt_instances_per_class
            state.num_gt_imgs_per_class
            state.num_images_correctly_detected_per_class
        """
        detection_classes = prediction_dict["detection_classes"]
        detection_scores = prediction_dict["detection_scores"]

        true_positive_idxs = []
        false_positive_idxs = []

        for class_label in range(1, len(state.scores_per_class) + 1):
            cur_scores = state.scores_per_class[class_label - 1]
            if not cur_scores:
                continue
            for i, score in enumerate(cur_scores[0]):
                class_name = self._reverse_label_map[class_label]
                # match_idxs = np.where(
                #     np.logical_and(detection_classes == class_label,
                #                    detection_scores == score))[0]

                match_idxs = predictions[
                    (predictions.Score == score)
                    & (predictions.LabelName == class_name)
                ].index

                if len(match_idxs) == 1:
                    is_tp = bool(
                        state.tp_fp_labels_per_class[class_label - 1][0][i]
                    )
                    if is_tp:
                        true_positive_idxs.append(match_idxs[0])
                    else:
                        false_positive_idxs.append(match_idxs[0])
                else:
                    # @todo(Tyler) this is an unaccounted-for match. It is unclear
                    #   what box it refers to because multiple boxes have the same
                    #   class label and score
                    pass

        return true_positive_idxs, false_positive_idxs


###############################################################################


def _load_labelmap(labelmap_path):
    """Loads labelmap from the labelmap path.

  Args:
    labelmap_path: Path to the labelmap.

  Returns:
    A dictionary mapping class name to class numerical id
    A list with dictionaries, one dictionary per category.
  """

    label_map = string_int_label_map_pb2.StringIntLabelMap()
    with open(labelmap_path, "r") as fid:
        label_map_string = fid.read()
        text_format.Merge(label_map_string, label_map)
    labelmap_dict = {}
    categories = []
    for item in label_map.item:
        labelmap_dict[item.name] = item.id
        categories.append({"id": item.id, "name": item.name})
    return labelmap_dict, categories


if __name__ == "__main__":
    print("Reading location annotations...")
    all_location_annotations = pd.read_csv(BOUNDING_BOXES)
    print("Reading label annotations...")
    all_label_annotations = pd.read_csv(IMAGE_LABELS)
    all_label_annotations.rename(
        columns={"Confidence": "ConfidenceImageLabel"}, inplace=True
    )

    all_annotations = pd.concat(
        [all_location_annotations, all_label_annotations]
    )

    print("Reading predictions...")
    all_predictions = pd.read_csv(INPUT_PREDICTIONS)
    images_processed = 0

    evaluator = Evaluator(CLASS_LABELMAP)

    print("Processing...")
    # for image_id, cur_predictions in all_predictions.groupby("ImageID"):
    for image_id in ["0032485d3a9720dc"]:
        print("Processing image %d" % images_processed)

        cur_groundtruth = all_annotations.loc[
            all_annotations["ImageID"] == image_id
        ]

        cur_predictions = all_predictions.loc[
            all_predictions["ImageID"] == image_id
        ]

        result = evaluator.evaluate_image(cur_groundtruth, cur_predictions)

    # metrics = evaluator.evaluate()
    #
    # with open(OUTPUT_METRICS, "w") as fid:
    #     io_utils.write_csv(fid, metrics)
