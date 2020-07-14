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


from object_detection.utils import per_image_evaluation


###############################################################################

HIERARCHY_FILE = "/Users/tylerganter/data/open-images-dataset/v4/bbox_labels_600_hierarchy.json"
BOUNDING_BOXES = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions.csv"
CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"
OUTPUT_METRICS = "output_metrics.csv"

###############################################################################

from abc import ABCMeta
from abc import abstractmethod
import logging
import unicodedata
import numpy as np
import six
from six.moves import range
from six.moves import zip
import tensorflow.compat.v1 as tf

from object_detection.utils import label_map_util


class OpenImagesDetectionEvaluator:
    def __init__(
        self,
        categories,
        evaluate_masks=False,
        matching_iou_threshold=0.5,
        recall_lower_bound=0.0,
        recall_upper_bound=1.0,
        use_weighted_mean_ap=False,
        evaluate_corlocs=False,
        evaluate_precision_recall=False,
        group_of_weight=1.0,
    ):
        if not evaluate_masks:
            metric_prefix = "OpenImagesDetectionChallenge"
        else:
            metric_prefix = "OpenImagesInstanceSegmentationChallenge"

        self._categories = categories
        self._num_classes = max([cat["id"] for cat in categories])
        if min(cat["id"] for cat in categories) < 1:
            raise ValueError("Classes should be 1-indexed.")
        self._matching_iou_threshold = matching_iou_threshold
        self._recall_lower_bound = recall_lower_bound
        self._recall_upper_bound = recall_upper_bound
        self._use_weighted_mean_ap = use_weighted_mean_ap
        self._label_id_offset = 1
        self._evaluate_masks = evaluate_masks
        self._group_of_weight = group_of_weight
        self._evaluation = object_detection_evaluation.ObjectDetectionEvaluation(
            num_groundtruth_classes=self._num_classes,
            matching_iou_threshold=self._matching_iou_threshold,
            recall_lower_bound=self._recall_lower_bound,
            recall_upper_bound=self._recall_upper_bound,
            use_weighted_mean_ap=self._use_weighted_mean_ap,
            label_id_offset=self._label_id_offset,
            group_of_weight=self._group_of_weight,
        )
        self._image_ids = set([])
        self._evaluate_corlocs = evaluate_corlocs
        self._evaluate_precision_recall = evaluate_precision_recall
        self._metric_prefix = (metric_prefix + "_") if metric_prefix else ""
        self._expected_keys = set(
            [
                standard_fields.InputDataFields.key,
                standard_fields.InputDataFields.groundtruth_boxes,
                standard_fields.InputDataFields.groundtruth_classes,
                standard_fields.InputDataFields.groundtruth_difficult,
                standard_fields.InputDataFields.groundtruth_instance_masks,
                standard_fields.DetectionResultFields.detection_boxes,
                standard_fields.DetectionResultFields.detection_scores,
                standard_fields.DetectionResultFields.detection_classes,
                standard_fields.DetectionResultFields.detection_masks,
            ]
        )
        self._build_metric_names()

        self._expected_keys = set(
            [
                standard_fields.InputDataFields.key,
                standard_fields.InputDataFields.groundtruth_boxes,
                standard_fields.InputDataFields.groundtruth_classes,
                standard_fields.InputDataFields.groundtruth_group_of,
                standard_fields.DetectionResultFields.detection_boxes,
                standard_fields.DetectionResultFields.detection_scores,
                standard_fields.DetectionResultFields.detection_classes,
            ]
        )
        if evaluate_masks:
            self._expected_keys.add(
                standard_fields.InputDataFields.groundtruth_instance_masks
            )
            self._expected_keys.add(
                standard_fields.DetectionResultFields.detection_masks
            )

        self._evaluatable_labels = {}
        # Only one of the two has to be provided, but both options are given
        # for compatibility with previous codebase.
        self._expected_keys.update(
            [
                standard_fields.InputDataFields.groundtruth_image_classes,
                standard_fields.InputDataFields.groundtruth_labeled_classes,
            ]
        )

    def get_internal_state(self):
        """Returns internal state and image ids that lead to the state.

    Note that only evaluation results will be returned (e.g. not raw predictions
    or groundtruth.
    """
        return self._evaluation.get_internal_state(), self._image_ids

    def merge_internal_state(self, image_ids, state_tuple):
        """Merges internal state with the existing state of evaluation.

    If image_id is already seen by evaluator, an error will be thrown.

    Args:
      image_ids: list of images whose state is stored in the tuple.
      state_tuple: state.
    """
        for image_id in image_ids:
            if image_id in self._image_ids:
                raise ValueError(
                    "Image with id {} already added.".format(image_id)
                )

        self._evaluation.merge_internal_state(state_tuple)

    def _build_metric_names(self):
        """Builds a list with metric names."""
        if self._recall_lower_bound > 0.0 or self._recall_upper_bound < 1.0:
            self._metric_names = [
                self._metric_prefix
                + "Precision/mAP@{}IOU@[{:.1f},{:.1f}]Recall".format(
                    self._matching_iou_threshold,
                    self._recall_lower_bound,
                    self._recall_upper_bound,
                )
            ]
        else:
            self._metric_names = [
                self._metric_prefix
                + "Precision/mAP@{}IOU".format(self._matching_iou_threshold)
            ]
        if self._evaluate_corlocs:
            self._metric_names.append(
                self._metric_prefix
                + "Precision/meanCorLoc@{}IOU".format(
                    self._matching_iou_threshold
                )
            )

        category_index = label_map_util.create_category_index(self._categories)
        for idx in range(self._num_classes):
            if idx + self._label_id_offset in category_index:
                category_name = category_index[idx + self._label_id_offset][
                    "name"
                ]
                try:
                    category_name = six.text_type(category_name, "utf-8")
                except TypeError:
                    pass
                category_name = unicodedata.normalize("NFKD", category_name)
                if six.PY2:
                    category_name = category_name.encode("ascii", "ignore")
                self._metric_names.append(
                    self._metric_prefix
                    + "PerformanceByCategory/AP@{}IOU/{}".format(
                        self._matching_iou_threshold, category_name
                    )
                )
                if self._evaluate_corlocs:
                    self._metric_names.append(
                        self._metric_prefix
                        + "PerformanceByCategory/CorLoc@{}IOU/{}".format(
                            self._matching_iou_threshold, category_name
                        )
                    )

    def add_single_ground_truth_image_info(self, image_id, groundtruth_dict):
        """Adds groundtruth for a single image to be used for evaluation.

    Args:
      image_id: A unique string/integer identifier for the image.
      groundtruth_dict: A dictionary containing -
        standard_fields.InputDataFields.groundtruth_boxes: float32 numpy array
          of shape [num_boxes, 4] containing `num_boxes` groundtruth boxes of
          the format [ymin, xmin, ymax, xmax] in absolute image coordinates.
        standard_fields.InputDataFields.groundtruth_classes: integer numpy array
          of shape [num_boxes] containing 1-indexed groundtruth classes for the
          boxes.
        standard_fields.InputDataFields.groundtruth_group_of: Optional length M
          numpy boolean array denoting whether a groundtruth box contains a
          group of instances.

    Raises:
      ValueError: On adding groundtruth for an image more than once.
    """
        if image_id in self._image_ids:
            raise ValueError(
                "Image with id {} already added.".format(image_id)
            )

        groundtruth_classes = (
            groundtruth_dict[
                standard_fields.InputDataFields.groundtruth_classes
            ]
            - self._label_id_offset
        )
        # If the key is not present in the groundtruth_dict or the array is empty
        # (unless there are no annotations for the groundtruth on this image)
        # use values from the dictionary or insert None otherwise.
        if standard_fields.InputDataFields.groundtruth_group_of in six.viewkeys(
            groundtruth_dict
        ) and (
            groundtruth_dict[
                standard_fields.InputDataFields.groundtruth_group_of
            ].size
            or not groundtruth_classes.size
        ):
            groundtruth_group_of = groundtruth_dict[
                standard_fields.InputDataFields.groundtruth_group_of
            ]
        else:
            groundtruth_group_of = None
            if not len(self._image_ids) % 1000:
                logging.warning(
                    "image %s does not have groundtruth group_of flag specified",
                    image_id,
                )
        if self._evaluate_masks:
            groundtruth_masks = groundtruth_dict[
                standard_fields.InputDataFields.groundtruth_instance_masks
            ]
        else:
            groundtruth_masks = None

        self._evaluation.add_single_ground_truth_image_info(
            image_id,
            groundtruth_dict[
                standard_fields.InputDataFields.groundtruth_boxes
            ],
            groundtruth_classes,
            groundtruth_is_difficult_list=None,
            groundtruth_is_group_of_list=groundtruth_group_of,
            groundtruth_masks=groundtruth_masks,
        )
        self._image_ids.update([image_id])

        input_fields = standard_fields.InputDataFields
        groundtruth_classes = (
                groundtruth_dict[input_fields.groundtruth_classes]
                - self._label_id_offset
        )
        image_classes = np.array([], dtype=int)
        if input_fields.groundtruth_image_classes in groundtruth_dict:
            image_classes = groundtruth_dict[
                input_fields.groundtruth_image_classes
            ]
        elif input_fields.groundtruth_labeled_classes in groundtruth_dict:
            image_classes = groundtruth_dict[
                input_fields.groundtruth_labeled_classes
            ]
        image_classes -= self._label_id_offset
        self._evaluatable_labels[image_id] = np.unique(
            np.concatenate((image_classes, groundtruth_classes))
        )

    def add_single_detected_image_info(self, image_id, detections_dict):
        """Adds detections for a single image to be used for evaluation.

    Args:
      image_id: A unique string/integer identifier for the image.
      detections_dict: A dictionary containing -
        standard_fields.DetectionResultFields.detection_boxes: float32 numpy
          array of shape [num_boxes, 4] containing `num_boxes` detection boxes
          of the format [ymin, xmin, ymax, xmax] in absolute image coordinates.
        standard_fields.DetectionResultFields.detection_scores: float32 numpy
          array of shape [num_boxes] containing detection scores for the boxes.
        standard_fields.DetectionResultFields.detection_classes: integer numpy
          array of shape [num_boxes] containing 1-indexed detection classes for
          the boxes.

    Raises:
      ValueError: If detection masks are not in detections dictionary.
    """
        if image_id not in self._image_ids:
            # Since for the correct work of evaluator it is assumed that groundtruth
            # is inserted first we make sure to break the code if is it not the case.
            self._image_ids.update([image_id])
            self._evaluatable_labels[image_id] = np.array([])

        detection_classes = (
            detections_dict[
                standard_fields.DetectionResultFields.detection_classes
            ]
            - self._label_id_offset
        )
        allowed_classes = np.where(
            np.isin(detection_classes, self._evaluatable_labels[image_id])
        )
        detection_classes = detection_classes[allowed_classes]
        detected_boxes = detections_dict[
            standard_fields.DetectionResultFields.detection_boxes
        ][allowed_classes]
        detected_scores = detections_dict[
            standard_fields.DetectionResultFields.detection_scores
        ][allowed_classes]

        if self._evaluate_masks:
            detection_masks = detections_dict[
                standard_fields.DetectionResultFields.detection_masks
            ][allowed_classes]
        else:
            detection_masks = None
        return self._evaluation.add_single_detected_image_info(
            image_key=image_id,
            detected_boxes=detected_boxes,
            detected_scores=detected_scores,
            detected_class_labels=detection_classes,
            detected_masks=detection_masks,
        )

    def clear(self):
        """Clears stored data."""
        self._evaluation = object_detection_evaluation.ObjectDetectionEvaluation(
            num_groundtruth_classes=self._num_classes,
            matching_iou_threshold=self._matching_iou_threshold,
            use_weighted_mean_ap=self._use_weighted_mean_ap,
            label_id_offset=self._label_id_offset,
        )
        self._image_ids.clear()

        self._evaluatable_labels.clear()

    def evaluate(self):
        """Compute evaluation result.

    Returns:
      A dictionary of metrics with the following fields -

      1. summary_metrics:
        '<prefix if not empty>_Precision/mAP@<matching_iou_threshold>IOU': mean
        average precision at the specified IOU threshold.

      2. per_category_ap: category specific results with keys of the form
        '<prefix if not empty>_PerformanceByCategory/
        mAP@<matching_iou_threshold>IOU/category'.
    """
        (
            per_class_ap,
            mean_ap,
            per_class_precision,
            per_class_recall,
            per_class_corloc,
            mean_corloc,
        ) = self._evaluation.evaluate()
        pascal_metrics = {self._metric_names[0]: mean_ap}
        if self._evaluate_corlocs:
            pascal_metrics[self._metric_names[1]] = mean_corloc
        category_index = label_map_util.create_category_index(self._categories)
        for idx in range(per_class_ap.size):
            if idx + self._label_id_offset in category_index:
                category_name = category_index[idx + self._label_id_offset][
                    "name"
                ]
                try:
                    category_name = six.text_type(category_name, "utf-8")
                except TypeError:
                    pass
                category_name = unicodedata.normalize("NFKD", category_name)
                if six.PY2:
                    category_name = category_name.encode("ascii", "ignore")
                display_name = (
                    self._metric_prefix
                    + "PerformanceByCategory/AP@{}IOU/{}".format(
                        self._matching_iou_threshold, category_name
                    )
                )
                pascal_metrics[display_name] = per_class_ap[idx]

                # Optionally add precision and recall values
                if self._evaluate_precision_recall:
                    display_name = (
                        self._metric_prefix
                        + "PerformanceByCategory/Precision@{}IOU/{}".format(
                            self._matching_iou_threshold, category_name
                        )
                    )
                    pascal_metrics[display_name] = per_class_precision[idx]
                    display_name = (
                        self._metric_prefix
                        + "PerformanceByCategory/Recall@{}IOU/{}".format(
                            self._matching_iou_threshold, category_name
                        )
                    )
                    pascal_metrics[display_name] = per_class_recall[idx]

                # Optionally add CorLoc metrics.classes
                if self._evaluate_corlocs:
                    display_name = (
                        self._metric_prefix
                        + "PerformanceByCategory/CorLoc@{}IOU/{}".format(
                            self._matching_iou_threshold, category_name
                        )
                    )
                    pascal_metrics[display_name] = per_class_corloc[idx]

        return pascal_metrics

    def add_eval_dict(self, eval_dict):
        """Observes an evaluation result dict for a single example.

    When executing eagerly, once all observations have been observed by this
    method you can use `.evaluate()` to get the final metrics.

    When using `tf.estimator.Estimator` for evaluation this function is used by
    `get_estimator_eval_metric_ops()` to construct the metric update op.

    Args:
      eval_dict: A dictionary that holds tensors for evaluating an object
        detection model, returned from
        eval_util.result_dict_for_single_example().

    Returns:
      None when executing eagerly, or an update_op that can be used to update
      the eval metrics in `tf.estimator.EstimatorSpec`.
    """
        # remove unexpected fields
        eval_dict_filtered = dict()
        for key, value in eval_dict.items():
            if key in self._expected_keys:
                eval_dict_filtered[key] = value

        eval_dict_keys = list(eval_dict_filtered.keys())

        def update_op(image_id, *eval_dict_batched_as_list):
            """Update operation that adds batch of images to ObjectDetectionEvaluator.

      Args:
        image_id: image id (single id or an array)
        *eval_dict_batched_as_list: the values of the dictionary of tensors.
      """
            if np.isscalar(image_id):
                single_example_dict = dict(
                    zip(eval_dict_keys, eval_dict_batched_as_list)
                )
                self.add_single_ground_truth_image_info(
                    image_id, single_example_dict
                )
                self.add_single_detected_image_info(
                    image_id, single_example_dict
                )
            else:
                for unzipped_tuple in zip(*eval_dict_batched_as_list):
                    single_example_dict = dict(
                        zip(eval_dict_keys, unzipped_tuple)
                    )
                    image_id = single_example_dict[
                        standard_fields.InputDataFields.key
                    ]
                    self.add_single_ground_truth_image_info(
                        image_id, single_example_dict
                    )
                    self.add_single_detected_image_info(
                        image_id, single_example_dict
                    )

        args = [eval_dict_filtered[standard_fields.InputDataFields.key]]
        args.extend(six.itervalues(eval_dict_filtered))
        return tf.py_func(update_op, args, [])

    def get_estimator_eval_metric_ops(self, eval_dict):
        """Returns dict of metrics to use with `tf.estimator.EstimatorSpec`.

    Note that this must only be implemented if performing evaluation with a
    `tf.estimator.Estimator`.

    Args:
      eval_dict: A dictionary that holds tensors for evaluating an object
        detection model, returned from
        eval_util.result_dict_for_single_example(). It must contain
        standard_fields.InputDataFields.key.

    Returns:
      A dictionary of metric names to tuple of value_op and update_op that can
      be used as eval metric ops in `tf.estimator.EstimatorSpec`.
    """
        update_op = self.add_eval_dict(eval_dict)

        def first_value_func():
            self._metrics = self.evaluate()
            self.clear()
            return np.float32(self._metrics[self._metric_names[0]])

        def value_func_factory(metric_name):
            def value_func():
                return np.float32(self._metrics[metric_name])

            return value_func

        # Ensure that the metrics are only evaluated once.
        first_value_op = tf.py_func(first_value_func, [], tf.float32)
        eval_metric_ops = {self._metric_names[0]: (first_value_op, update_op)}
        with tf.control_dependencies([first_value_op]):
            for metric_name in self._metric_names[1:]:
                eval_metric_ops[metric_name] = (
                    tf.py_func(
                        value_func_factory(metric_name), [], np.float32
                    ),
                    update_op,
                )
        return eval_metric_ops



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

    evaluate_masks = False
    all_annotations = pd.concat(
        [all_location_annotations, all_label_annotations]
    )

    print("Reading labelmap...")
    class_label_map, categories = _load_labelmap(CLASS_LABELMAP)

    challenge_evaluator = OpenImagesDetectionEvaluator(
        categories, evaluate_masks=evaluate_masks
    )

    num_classes = max([cat["id"] for cat in categories])
    if min(cat["id"] for cat in categories) < 1:
        raise ValueError("Classes should be 1-indexed.")
    label_id_offset = 1

    per_image_eval = per_image_evaluation.PerImageEvaluation(
        num_groundtruth_classes=num_classes,
        nms_iou_threshold=1.0,
        nms_max_output_boxes=10000,
    )

    print("Reading predictions...")
    all_predictions = pd.read_csv(INPUT_PREDICTIONS)
    images_processed = 0

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

        groundtruth_dict = utils.build_groundtruth_dictionary(
            cur_groundtruth, class_label_map
        )

        prediction_dict = utils.build_predictions_dictionary(
            cur_predictions, class_label_map
        )

        challenge_evaluator.add_single_ground_truth_image_info(
            image_id, groundtruth_dict
        )

        RESULT = challenge_evaluator.add_single_detected_image_info(
            image_id, prediction_dict
        )

        scores, tp_fp_labels, is_class_correctly_detected_in_image = RESULT
        # print("scores: ", scores, "\n")
        # print("tp_fp_labels: ", tp_fp_labels, "\n")
        # print("is_class_correctly_detected_in_image: ", is_class_correctly_detected_in_image, "\n")
        scores_stack = np.hstack(scores)
        print("np.hstack(scores): ", scores_stack, "\n")
        assert len(scores_stack) == 25, "len: %d" % len(scores_stack)
        assert scores_stack[0] == 0.5392, (
            "scores_stack[0]: %f" % scores_stack[0]
        )
        assert scores_stack[-1] == 0.6171, (
            "scores_stack[-1]: %f" % scores_stack[-1]
        )
        import sys

        sys.exit("DONE")

        # # ADD GROUND TRUTH
        # groundtruth_classes = (
        #         groundtruth_dict[
        #             standard_fields.InputDataFields.groundtruth_classes] -
        #         label_id_offset)
        # # If the key is not present in the groundtruth_dict or the array is empty
        # # (unless there are no annotations for the groundtruth on this image)
        # # use values from the dictionary or insert None otherwise.
        # if (
        #         standard_fields.InputDataFields.groundtruth_group_of in six.viewkeys(
        #         groundtruth_dict) and
        #         (groundtruth_dict[
        #              standard_fields.InputDataFields.groundtruth_group_of]
        #                  .size or not groundtruth_classes.size)):
        #     groundtruth_group_of = groundtruth_dict[
        #         standard_fields.InputDataFields.groundtruth_group_of]
        # else:
        #     groundtruth_group_of = None
        #     if not len(self._image_ids) % 1000:
        #         logging.warning(
        #             'image %s does not have groundtruth group_of flag specified',
        #             image_id)
        # if evaluate_masks:
        #     groundtruth_masks = groundtruth_dict[
        #         standard_fields.InputDataFields.groundtruth_instance_masks]
        # else:
        #     groundtruth_masks = None
        #
        # self._evaluation.add_single_ground_truth_image_info(
        #     image_id,
        #     groundtruth_dict[
        #         standard_fields.InputDataFields.groundtruth_boxes],
        #     groundtruth_classes,
        #     groundtruth_is_difficult_list=None,
        #     groundtruth_is_group_of_list=groundtruth_group_of,
        #     groundtruth_masks=groundtruth_masks)
        # self._image_ids.update([image_id])
        # input_fields = standard_fields.InputDataFields
        # groundtruth_classes = (
        #         groundtruth_dict[input_fields.groundtruth_classes] -
        #         label_id_offset)
        # image_classes = np.array([], dtype=int)
        # if input_fields.groundtruth_image_classes in groundtruth_dict:
        #     image_classes = groundtruth_dict[
        #         input_fields.groundtruth_image_classes]
        # elif input_fields.groundtruth_labeled_classes in groundtruth_dict:
        #     image_classes = groundtruth_dict[
        #         input_fields.groundtruth_labeled_classes]
        # image_classes -= label_id_offset
        # evaluatable_labels = np.unique(
        #     np.concatenate((image_classes, groundtruth_classes)))

        # # ADD PREDICTIONS
        # detection_classes = (
        #         prediction_dict[
        #             standard_fields.DetectionResultFields.detection_classes]
        #         - label_id_offset)
        # allowed_classes = np.where(
        #     np.isin(detection_classes, evaluatable_labels))
        # detection_classes = detection_classes[allowed_classes]
        # detected_boxes = prediction_dict[
        #     standard_fields.DetectionResultFields.detection_boxes][
        #     allowed_classes]
        # detected_scores = prediction_dict[
        #     standard_fields.DetectionResultFields.detection_scores][
        #     allowed_classes]
        #
        # if evaluate_masks:
        #     detection_masks = \
        #     prediction_dict[standard_fields.DetectionResultFields
        #         .detection_masks][allowed_classes]
        # else:
        #     detection_masks = None
        # self._evaluation.add_single_detected_image_info(
        #     image_key=image_id,
        #     detected_boxes=detected_boxes,
        #     detected_scores=detected_scores,
        #     detected_class_labels=detection_classes,
        #     detected_masks=detection_masks)

        images_processed += 1

    metrics = challenge_evaluator.evaluate()

    with open(OUTPUT_METRICS, "w") as fid:
        io_utils.write_csv(fid, metrics)
