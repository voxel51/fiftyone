"""
@todo(Tyler)
"""
from google.protobuf import text_format
import numpy as np
import pandas as pd

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.utils.open_images import detections2df, classifications2df

import sys

sys.path.insert(0, fo.config.tf_object_detection_dir)
# pylint: disable=import-error

object_detection = fou.lazy_import(
    "object_detection", callback=fou.ensure_object_detection
)

from object_detection.metrics import oid_challenge_evaluation_utils as utils
from object_detection.protos import string_int_label_map_pb2
from object_detection.utils import object_detection_evaluation


class TensorflowObjectDetectionAPIEvaluator:
    def __init__(self, class_label_map_path, iou_threshold=0.5):
        """
        Args:
            class_label_map_path: path to the label map .pbtxt file
        """
        self._iou_threshold = iou_threshold

        self._class_label_map, self._categories = self.load_labelmap(
            class_label_map_path
        )
        self._reverse_label_map = {
            v: k for k, v in self._class_label_map.items()
        }

        self._evaluator = object_detection_evaluation.OpenImagesChallengeEvaluator(
            self._categories,
            evaluate_masks=False,
            matching_iou_threshold=self._iou_threshold,
        )

    def evaluate_image(self, image_id, groundtruth, predictions):
        """

        Args:
            image_id (str): the Open Images ID
            groundtruth: pandas.DataFrame with columns:
                'ImageID', 'Source', 'LabelName', 'Confidence',
                'XMin', 'XMax', 'YMin', 'YMax',
                'IsOccluded', 'IsTruncated', 'IsGroupOf', 'IsDepiction',
                'IsInside', 'ConfidenceImageLabel'
            predictions: pandas.DataFrame with columns:
                'ImageID', 'LabelName', 'Score', 'XMin', 'XMax', 'YMin', 'YMax'

        Returns:
            a dictionary with structure:
                {
                    "true_positive_indexes": [<IDX1>, <IDX2>, ...],
                    "false_positive_indexes": [<IDX1>, <IDX2>, ...],
                    "mAP": <mAP>,
                    "AP_per_class": {
                        "<LabelName>": <AP>,
                        "<LabelName>": <AP>,
                        ...
                    }
                }
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
            result = self._evaluate_image(predictions)
        finally:
            self._evaluator.clear()

        return result

    def _evaluate_image(self, predictions):
        state, _ = self._evaluator.get_internal_state()
        tp_idxs, fp_idxs = self._get_TP_FP(state, predictions)

        eval_result = self._evaluator.evaluate()

        return {
            "true_positive_indexes": tp_idxs,
            "false_positive_indexes": fp_idxs,
            "mAP": self._get_mAP(eval_result),
            "AP_per_class": self._get_AP_per_class(eval_result),
        }

    def _get_TP_FP(self, state, predictions):
        """Finds the true positive and false positive bounding boxes.

        Returns:
              true_positive_idxs, false_positive_idxs: each of which is a list
                of row indexes for prediction rows with true positives and
                false positives respectively.
                To be accessed via:
                    predictions.loc[true_positive_idxs]
        """
        true_positive_idxs = []
        false_positive_idxs = []

        for class_label in range(1, len(state.scores_per_class) + 1):
            cur_scores = state.scores_per_class[class_label - 1]
            if not cur_scores:
                continue

            for i, score in enumerate(cur_scores[0]):
                class_name = self._reverse_label_map[class_label]

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
                    # @todo(Tyler) this is an unaccounted-for match. It is
                    #   unclear what box it refers to because multiple boxes
                    #   have the same class label and score
                    pass

        return true_positive_idxs, false_positive_idxs

    def _get_mAP(self, eval_result):
        keys = [key for key in eval_result if "mAP" in key]
        assert len(keys) == 1, "unexpected number of mAP keys: %d" % len(keys)
        return eval_result[keys[0]]

    def _get_AP_per_class(self, eval_result):
        d = {}
        for key, average_precision in eval_result.items():
            if "PerformanceByCategory" not in key:
                continue
            class_name = "/" + key.split("//")[-1]
            d[class_name] = average_precision
        return d

    @staticmethod
    def load_labelmap(labelmap_path):
        """Loads labelmap from the labelmap path.

        Args:
            labelmap_path: Path to the labelmap.

        Returns:
            A dictionary mapping class name to class numerical id
            A list with dictionaries, one dictionary per category.
        """
        # pylint: disable=no-member
        label_map = string_int_label_map_pb2.StringIntLabelMap()
        with open(labelmap_path, "r") as fid:
            label_map_string = fid.read()
            text_format.Merge(label_map_string, label_map)
        labelmap_dict = {}
        categories = []
        for item in label_map.item:
            labelmap_dict[item.name] = item.id
            categories.append(
                {
                    "id": item.id,
                    "name": item.name,
                    "display_name": item.display_name,
                }
            )
        return labelmap_dict, categories


def evaluate_dataset(
    dataset,
    label_map_path,
    groundtruth_loc_field_name="groundtruth_detections",
    groundtruth_img_labels_field_name="groundtruth_image_labels",
    predictions_field_name="predicted_detections",
    iou_threshold=0.5,
):
    _, categories = TensorflowObjectDetectionAPIEvaluator.load_labelmap(
        label_map_path
    )
    display2name_map = {d["display_name"]: d["name"] for d in categories}
    name2display_map = {d["name"]: d["display_name"] for d in categories}

    evaluator = TensorflowObjectDetectionAPIEvaluator(
        label_map_path, iou_threshold=iou_threshold
    )

    with fou.ProgressBar(dataset) as pb:
        for sample in pb(dataset):
            # convert groundtruth to dataframe
            loc_annos = detections2df(
                sample.open_images_id,
                sample[groundtruth_loc_field_name],
                display2name_map=display2name_map,
                is_groundtruth=True,
            )
            label_annos = classifications2df(
                sample.open_images_id,
                sample[groundtruth_img_labels_field_name],
                display2name_map=display2name_map,
            )
            groundtruth = pd.concat([loc_annos, label_annos])

            # convert predictions to dataframe
            predictions = detections2df(
                sample.open_images_id,
                sample[predictions_field_name],
                display2name_map=display2name_map,
            )

            # evaluate
            result = evaluator.evaluate_image(
                sample.open_images_id, groundtruth, predictions
            )

            # store mAP
            mAP = result["mAP"]
            if not np.isnan(mAP):
                sample["mAP"] = mAP

            # store AP per class
            sample["AP_per_class"] = {
                name2display_map[k]: v
                for k, v in result["AP_per_class"].items()
                if not np.isnan(v)
            }

            # store false positives
            for idx in result["false_positive_indexes"]:
                det = sample[predictions_field_name].detections[idx]
                det.attributes["eval"] = fol.CategoricalAttribute(
                    value="false_positive"
                )

            # store true positives
            for idx in result["true_positive_indexes"]:
                det = sample[predictions_field_name].detections[idx]
                det.attributes["eval"] = fol.CategoricalAttribute(
                    value="true_positive"
                )

            sample.save()
