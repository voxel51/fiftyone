""""""
import os

import pandas as pd
from google.protobuf import text_format

import sys

sys.path.append("/Users/tylerganter/source/theta/tensorflow/models/research")

from object_detection.metrics import io_utils
from object_detection.metrics import oid_challenge_evaluation_utils as utils
from object_detection.protos import string_int_label_map_pb2
from object_detection.utils import object_detection_evaluation


from object_detection.utils import per_image_evaluation


###############################################################################

HIERARCHY_FILE = "/Users/tylerganter/data/open-images-dataset/v4/bbox_labels_600_hierarchy.json"
BOUNDING_BOXES = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions.csv"
CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"
OUTPUT_METRICS = "output_metrics.csv"

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
    for arg in [
        HIERARCHY_FILE,
        BOUNDING_BOXES,
        IMAGE_LABELS,
        INPUT_PREDICTIONS,
        CLASS_LABELMAP,
    ]:
        assert os.path.exists(arg), "Missing file: %" % arg

    print("Reading location annotations...")
    all_location_annotations = pd.read_csv(BOUNDING_BOXES)
    print("Reading label annotations...")
    all_label_annotations = pd.read_csv(IMAGE_LABELS)
    all_label_annotations.rename(
        columns={"Confidence": "ConfidenceImageLabel"}, inplace=True
    )

    is_instance_segmentation_eval = False
    all_annotations = pd.concat(
        [all_location_annotations, all_label_annotations]
    )

    print("Reading labelmap...")
    class_label_map, categories = _load_labelmap(CLASS_LABELMAP)


    challenge_evaluator = object_detection_evaluation.OpenImagesChallengeEvaluator(
        categories, evaluate_masks=is_instance_segmentation_eval
    )
    # recall_lower_bound = 0.0
    # recall_upper_bound = 1.0
    # evaluate_corlocs = False
    # evaluate_precision_recall = False
    # metric_prefix = None
    # use_weighted_mean_ap = False
    # evaluate_masks = is_instance_segmentation_eval
    num_classes = max([cat['id'] for cat in categories])
    if min(cat['id'] for cat in categories) < 1:
        raise ValueError('Classes should be 1-indexed.')

    per_image_eval = per_image_evaluation.PerImageEvaluation(
        num_groundtruth_classes=num_classes,
        nms_iou_threshold=1.0,
        nms_max_output_boxes=10000
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

        groundtruth_dictionary = utils.build_groundtruth_dictionary(
            cur_groundtruth, class_label_map
        )

        prediction_dictionary = utils.build_predictions_dictionary(
            cur_predictions, class_label_map
        )

        challenge_evaluator.add_single_ground_truth_image_info(
            image_id, groundtruth_dictionary
        )

        challenge_evaluator.add_single_detected_image_info(
            image_id, prediction_dictionary
        )

        images_processed += 1

    metrics = challenge_evaluator.evaluate()

    with open(OUTPUT_METRICS, "w") as fid:
        io_utils.write_csv(fid, metrics)
