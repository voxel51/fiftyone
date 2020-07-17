"""
@todo(Tyler)
"""
import glob
import os

from google.protobuf import text_format
import numpy as np
import pandas as pd

import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou

import sys

sys.path.append("/Users/tylerganter/source/theta/tensorflow/models/research")

from object_detection.metrics import oid_challenge_evaluation_utils as utils
from object_detection.protos import string_int_label_map_pb2
from object_detection.utils import object_detection_evaluation


def load_open_images_dataset(
    dataset_name,
    images_dir,
    bounding_boxes_path=None,
    image_labels_path=None,
    predictions_path=None,
    prediction_field_name=None,
    class_descriptions_path=None,
    load_images_with_preds=False,
):
    """

    Args:
        dataset_name:
        images_dir:
        bounding_boxes_path:
        image_labels_path:
        predictions_path:
        prediction_field_name:
        class_descriptions_path: optional metadata file. if provided, the
            MID labels are mapped to descriptive labels
        load_images_with_preds: if True, skip any images that do not have
            predictions

    Returns:
        a :class:`fiftyone.core.dataset.Dataset` instance
    """
    # pylint: disable=unsubscriptable-object
    # read data from disk
    all_location_annotations = (
        pd.read_csv(bounding_boxes_path) if bounding_boxes_path else None
    )
    all_label_annotations = (
        pd.read_csv(image_labels_path) if image_labels_path else None
    )
    if predictions_path:
        all_predictions = pd.read_csv(predictions_path)
        all_predictions.rename(columns={"Score": "Confidence"}, inplace=True)
    else:
        all_predictions = None
    prediction_field_name = prediction_field_name or "predicted_detections"
    class_descriptions = (
        pd.read_csv(class_descriptions_path, header=None, index_col=0)
        if class_descriptions_path
        else None
    )

    # map label MID to descriptive label
    if class_descriptions is not None:
        for df in [
            all_location_annotations,
            all_label_annotations,
            all_predictions,
        ]:
            if df is None:
                continue

            temp = class_descriptions.loc[df["LabelName"], 1]
            temp.index = df.index
            df["LabelName"] = temp

    if load_images_with_preds:
        img_paths = [
            os.path.join(images_dir, image_id + ".jpg")
            for image_id in set(all_predictions["ImageID"])
        ]
    else:
        img_paths = glob.glob(os.path.join(images_dir, "*.jpg"))

    # @todo(Tyler)
    img_paths = img_paths[:300]

    _samples = []
    with fou.ProgressBar(img_paths) as pb:
        for image_path in pb(img_paths):
            image_id = os.path.splitext(os.path.basename(image_path))[0]

            kwargs = {"filepath": image_path, "open_images_id": image_id}

            # parse ground truth image labels
            if all_label_annotations is not None:
                cur_lab_anns = all_label_annotations.loc[
                    all_label_annotations["ImageID"] == image_id
                ]
                if not cur_lab_anns.empty:
                    kwargs["groundtruth_image_labels"] = df2classifications(
                        cur_lab_anns
                    )

            # parse ground truth bounding boxes
            if all_location_annotations is not None:
                cur_loc_anns = all_location_annotations.loc[
                    all_location_annotations["ImageID"] == image_id
                ]
                if not cur_loc_anns.empty:
                    kwargs["groundtruth_detections"] = df2detections(
                        cur_loc_anns
                    )

            # parse prediction bounding boxes
            if all_predictions is not None:
                cur_preds = all_predictions.loc[
                    all_predictions["ImageID"] == image_id
                ]
                if not cur_preds.empty:
                    kwargs[prediction_field_name] = df2detections(cur_preds)

            _samples.append(fos.Sample(**kwargs))

    dataset = fod.Dataset(dataset_name)
    dataset.add_samples(_samples)

    return dataset


def df2classifications(df):
    """

    Args:
        df: a pandas.DataFrame
            Required columns:
                LabelName   - the label MID
                Confidence  - float [0, 1]

            Optional Columns:
                Source      - 'freeform', 'verification', ...

    Returns:
         a :class:`fiftyone.core.labels.Classifications` instance
    """

    def get_attributes(row):
        attributes = {}
        if "Source" in df:
            attributes["Source"] = fol.CategoricalAttribute(value=row.Source)
        return attributes

    return fol.Classifications(
        classifications=[
            fol.Classification(
                label=row.LabelName,
                confidence=row.Confidence,
                attributes=get_attributes(row),
            )
            for _, row in df.iterrows()
        ]
    )


def df2detections(df):
    """

    Args:
        df: a pandas.DataFrame
            Required columns:
                LabelName   - the label MID
                Confidence  - float [0, 1]
                XMin        - float [0, 1]
                XMax        - float [0, 1]
                YMin        - float [0, 1]
                YMax        - float [0, 1]

            Optional Columns:
                Source      - 'freeform', 'verification', ...
                IsOccluded  - boolean (or castable)
                IsTruncated - boolean (or castable)
                IsGroupOf   - boolean (or castable)
                IsDepiction - boolean (or castable)
                IsInside    - boolean (or castable)

    Returns:
         a :class:`fiftyone.core.labels.Detections` instance
    """

    def get_attributes(row):
        attributes = {}
        if "Source" in df:
            attributes["Source"] = fol.CategoricalAttribute(value=row.Source)
        for col_name in [
            "IsOccluded",
            "IsTruncated",
            "IsGroupOf",
            "IsDepiction",
            "IsInside",
        ]:
            if col_name in df:
                attributes[col_name] = fol.BooleanAttribute(
                    value=row[col_name]
                )
        return attributes

    return fol.Detections(
        detections=[
            fol.Detection(
                label=row.LabelName,
                confidence=row.Confidence,
                # [<top-left-x>, <top-right-y>, <width>, <height>]
                bounding_box=[
                    row.XMin,
                    row.YMin,
                    row.XMax - row.XMin,
                    row.YMax - row.YMin,
                ],
                attributes=get_attributes(row),
            )
            for _, row in df.iterrows()
        ]
    )


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
        confidence_key: [det.confidence for det in dets],
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
