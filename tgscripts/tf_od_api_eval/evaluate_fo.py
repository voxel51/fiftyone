"""

"""
import numpy as np
import pandas as pd
from pprintpp import pprint

from fiftyone.utils.tfodeval import TensorflowObjectDetectionAPIEvaluator

import fiftyone as fo

pd.set_option("display.max_columns", 500)

###############################################################################

CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"

###############################################################################


def detections2df(
    image_id, detections, display2name_map=None, is_groundtruth=False
):
    """

    Args:
        detections:
        display2name_map:
        is_groundtruth:

    Returns:
        a pandas.DataFrame
    """
    dets = detections.detections

    d = {
        "ImageID": image_id,
        "LabelName": [det.label for det in dets],
        "Confidence": [int(det.confidence) for det in dets],
    }

    if display2name_map:
        d["LabelName"] = [display2name_map[label] for label in d["LabelName"]]

    # (N,4) [<top-left-x>, <top-left-y>, <width>, <height>]
    bboxes = np.vstack([det.bounding_box for det in dets])
    d["XMin"] = bboxes[:, 0]
    d["XMax"] = bboxes[:, 0] + bboxes[:, 2]
    d["YMin"] = bboxes[:, 1]
    d["YMax"] = bboxes[:, 1] + bboxes[:, 3]

    if is_groundtruth:
        d["Source"] = [det.attributes["Source"].value for det in dets]

        # boolean attributes
        for col_name in [
            "IsOccluded",
            "IsTruncated",
            "IsGroupOf",
            "IsDepiction",
            "IsInside",
        ]:
            d[col_name] = [int(det.attributes[col_name].value) for det in dets]

    return pd.DataFrame(d)


def classifications2df(image_id, classifications, display2name_map=None):
    """

    Args:
        classifications:
        display2name_map:

    Returns:
         a pandas.DataFrame
    """
    labs = classifications.classifications

    d = {
        "ImageID": image_id,
        "LabelName": [lab.label for lab in labs],
        "ConfidenceImageLabel": [int(lab.confidence) for lab in labs],
    }

    if display2name_map:
        d["LabelName"] = [display2name_map[label] for label in d["LabelName"]]

    d["Source"] = [lab.attributes["Source"].value for lab in labs]

    return pd.DataFrame(d)


###############################################################################

dataset = fo.load_dataset("open-images-v4-test")

_, categories = TensorflowObjectDetectionAPIEvaluator.load_labelmap(
    CLASS_LABELMAP
)
display2name_map = {d["display_name"]: d["name"] for d in categories}

print(dataset)
print("~" * 100)

gt_loc_field = "groundtruth_detections"
gt_lab_field = "groundtruth_image_labels"
preds_field = "faster_rcnn"

for sample in dataset:
    df = detections2df(
        sample.open_images_id,
        sample[gt_loc_field],
        display2name_map=display2name_map,
        is_groundtruth=True,
    )
    df = detections2df(
        sample.open_images_id,
        sample[preds_field],
        display2name_map=display2name_map,
    )
    df = classifications2df(
        sample.open_images_id,
        sample[gt_lab_field],
        display2name_map=display2name_map,
    )
    print("~" * 100)
    print(df)
    break


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
