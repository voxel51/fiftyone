"""

"""
import pandas as pd
from pprintpp import pprint

from fiftyone.utils.tfodeval import TensorflowObjectDetectionAPIEvaluator

import fiftyone as fo

###############################################################################

CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"

BOUNDING_BOXES_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions/small.csv"

###############################################################################

dataset = fo.load_dataset("open-images-v4-test")

all_location_annotations = pd.read_csv(BOUNDING_BOXES_EXPANDED)

print(all_location_annotations.head())

import sys

sys.exit()

all_location_annotations = pd.read_csv(BOUNDING_BOXES_EXPANDED)
all_label_annotations = pd.read_csv(IMAGE_LABELS_EXPANDED)
all_label_annotations.rename(
    columns={"Confidence": "ConfidenceImageLabel"}, inplace=True
)

all_annotations = pd.concat([all_location_annotations, all_label_annotations])

all_predictions = pd.read_csv(INPUT_PREDICTIONS)
images_processed = 0

evaluator = TensorflowObjectDetectionAPIEvaluator(
    CLASS_LABELMAP, iou_threshold=0.5
)

# for image_id, cur_predictions in all_predictions.groupby("ImageID"):
for image_id in ["0032485d3a9720dc"]:
    print("Processing image %d" % images_processed)

    cur_groundtruth = all_annotations.loc[
        all_annotations["ImageID"] == image_id
    ]

    cur_predictions = all_predictions.loc[
        all_predictions["ImageID"] == image_id
    ]

    result = evaluator.evaluate_image(
        image_id, cur_groundtruth, cur_predictions
    )

    pprint(result)

# s = fo.launch_app(dataset=dataset)
