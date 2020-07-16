"""

"""
import numpy as np
import pandas as pd

from fiftyone.utils.tfodeval import TensorflowObjectDetectionAPIEvaluator

import fiftyone as fo
import fiftyone.core.utils as fou

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
    confidence_key = "Confidence" if is_groundtruth else "Score"

    if detections is None:
        columns = ["ImageID", "LabelName"]
        if is_groundtruth:
            columns += [
                "Source",
                "IsOccluded",
                "IsTruncated",
                "IsGroupOf",
                "IsDepiction",
                "IsInside",
            ]
        df = pd.DataFrame(columns=columns)
        # these columns need to be float dtype
        df2 = pd.DataFrame(
            columns=[confidence_key, "XMin", "XMax", "YMin", "YMax"],
            dtype=float,
        )
        for col in df2.columns:
            df[col] = df2[col]

        return df

    dets = detections.detections

    d = {
        "ImageID": image_id,
        "LabelName": [det.label for det in dets],
        confidence_key: [int(det.confidence) for det in dets],
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
    if classifications is None:
        columns = ["ImageID", "LabelName", "ConfidenceImageLabel", "Source"]
        return pd.DataFrame(columns=columns)

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

            predictions = detections2df(
                sample.open_images_id,
                sample[predictions_field_name],
                display2name_map=display2name_map,
            )

            result = evaluator.evaluate_image(
                sample.open_images_id, groundtruth, predictions
            )

            sample["mAP"] = result["mAP"]

            sample["AP_per_class"] = {
                name2display_map[k]: v
                for k, v in result["AP_per_class"].items()
                if not np.isnan(v)
            }

            for idx in result["false_positive_indexes"]:
                det = sample[predictions_field_name].detections[idx]
                det.attributes["eval"] = fo.CategoricalAttribute(
                    value="false_positive"
                )
            for idx in result["true_positive_indexes"]:
                det = sample[predictions_field_name].detections[idx]
                det.attributes["eval"] = fo.CategoricalAttribute(
                    value="true_positive"
                )

            sample.save()


###############################################################################

dataset = fo.load_dataset("open-images-v4-test")

evaluate_dataset(dataset, CLASS_LABELMAP, predictions_field_name="faster_rcnn")

for sample in dataset:
    if np.isnan(sample.mAP):
        del sample.mAP
        sample.save()

###############################################################################

import sys

sys.exit()

import fiftyone as fo

dataset = fo.load_dataset("open-images-v4-test")

s = fo.launch_app(dataset=dataset)
