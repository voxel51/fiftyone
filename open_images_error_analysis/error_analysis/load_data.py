"""

<dataset_dir>/
    data/
        <id1>.<ext>
        <id2>.<ext>
    annotations-bbox.csv
    annotations-human-imagelabels-boxable.csv
    class-descriptions-boxable.csv

"""
import glob
import os

import numpy as np
import pandas as pd

import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou


# supplemental columns
CLASSIFICATION_COLUMNS = ["Source"]
DETECTION_COLUMNS = [
    "Source",
    "IsOccluded",
    "IsTruncated",
    "IsGroupOf",
    "IsDepiction",
    "IsInside",
]

# field names
OPEN_IMAGES_ID = "open_images_id"
GT_IMAGE_LABELS = "groundtruth_image_labels"
GT_DETECTIONS = "groundtruth_detections"


def load_open_images_dataset(
    dataset_name,
    images_dir,
    bounding_boxes_path=None,
    image_labels_path=None,
    predictions_path=None,
    prediction_field_name="predicted_detections",
    class_descriptions_path=None,
    load_images_with_preds=False,
    max_num_images=-1,
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

    if max_num_images != -1:
        img_paths = img_paths[:max_num_images]

    _samples = []
    with fou.ProgressBar(img_paths) as pb:
        for image_path in pb(img_paths):
            image_id = os.path.splitext(os.path.basename(image_path))[0]

            kwargs = {"filepath": image_path, OPEN_IMAGES_ID: image_id}

            # parse ground truth image labels
            if all_label_annotations is not None:
                cur_lab_anns = all_label_annotations.query(
                    "ImageID == '%s'" % image_id
                )
                if not cur_lab_anns.empty:
                    kwargs[GT_IMAGE_LABELS] = df2classifications(cur_lab_anns)

            # parse ground truth bounding boxes
            if all_location_annotations is not None:
                cur_loc_anns = all_location_annotations.query(
                    "ImageID == '%s'" % image_id
                )
                if not cur_loc_anns.empty:
                    kwargs[GT_DETECTIONS] = df2detections(cur_loc_anns)

            # parse prediction bounding boxes
            if all_predictions is not None:
                cur_preds = all_predictions.query("ImageID == '%s'" % image_id)
                if not cur_preds.empty:
                    kwargs[prediction_field_name] = df2detections(cur_preds)

            _samples.append(fos.Sample(**kwargs))

    dataset = fod.Dataset(dataset_name)
    dataset.add_samples(_samples)

    return dataset


def add_open_images_predictions(
    dataset,
    predictions_path,
    class_descriptions_path=None,
    prediction_field_name="predicted_detections",
):
    """

    :param dataset:
    :param predictions_path:
    :param class_descriptions_path:
    :param prediction_field_name:
    :return:
    """
    all_predictions = pd.read_csv(predictions_path)
    all_predictions.rename(columns={"Score": "Confidence"}, inplace=True)

    # map label MID to descriptive label
    if class_descriptions_path is not None:
        class_descriptions = pd.read_csv(
            class_descriptions_path, header=None, index_col=0
        )

        temp = class_descriptions.loc[all_predictions["LabelName"], 1]
        temp.index = all_predictions.index
        all_predictions["LabelName"] = temp

    with fou.ProgressBar(dataset) as pb:
        for sample in pb(dataset):
            # parse prediction bounding boxes
            cur_preds = all_predictions.loc[
                all_predictions["ImageID"] == sample[OPEN_IMAGES_ID]
            ]
            if not cur_preds.empty:
                sample[prediction_field_name] = df2detections(cur_preds)
                sample.save()


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
    supplemental_columns = [fn for fn in CLASSIFICATION_COLUMNS if fn in df]

    return fol.Classifications(
        classifications=[
            fol.Classification(
                label=row.LabelName,
                confidence=row.Confidence,
                **{sc: row[sc] for sc in supplemental_columns},
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
    supplemental_columns = [fn for fn in DETECTION_COLUMNS if fn in df]

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
                **{sc: row[sc] for sc in supplemental_columns},
            )
            for _, row in df.iterrows()
        ]
    )


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
        d["Source"] = [det["Source"] for det in dets]

        # boolean attributes
        for col_name in [
            "IsOccluded",
            "IsTruncated",
            "IsGroupOf",
            "IsDepiction",
            "IsInside",
        ]:
            d[col_name] = [int(det[col_name]) for det in dets]

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

    for col in CLASSIFICATION_COLUMNS:
        d[col] = [lab[col] for lab in labs]

    return pd.DataFrame(d)
