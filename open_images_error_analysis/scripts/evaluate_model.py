"""

"""
from fiftyone.utils.tfodeval import evaluate_dataset

import fiftyone as fo

###############################################################################

CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"

###############################################################################

dataset = fo.load_dataset("open-images-v4-test")

evaluate_dataset(dataset, CLASS_LABELMAP, predictions_field_name="faster_rcnn")

for sample in dataset:
    sample["faster_rcnn_TP"] = fo.Detections(
        detections=[
            det
            for det in sample["faster_rcnn"].detections
            if (
                "eval" in det.attributes
                and det.attributes["eval"].value == "true_positive"
            )
        ]
    )

    sample["faster_rcnn_FP"] = fo.Detections(
        detections=[
            det
            for det in sample["faster_rcnn"].detections
            if (
                "eval" in det.attributes
                and det.attributes["eval"].value == "false_positive"
            )
        ]
    )

    sample.save()

###############################################################################

import sys

sys.exit()

import fiftyone as fo

dataset = fo.load_dataset("open-images-v4-test")

s = fo.launch_app(dataset=dataset)
