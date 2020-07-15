"""
Analyze Open Images V6

dataset = fo.load_dataset("open-images-V6-validation")

"""
import glob
import os

import pandas as pd

import fiftyone as fo
import fiftyone.core.utils as fou


###############################################################################

IMAGES_DIR = "/Users/tylerganter/data/open-images-dataset/images/test"
BOUNDING_BOXES_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/predictions/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions/tf_od_api_format/small.csv"
CLASS_DESCRIPTIONS = "/Users/tylerganter/data/open-images-dataset/v4/class-descriptions-boxable.csv"

CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"

###############################################################################


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
    img_paths = img_paths[:100]

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

            # if (
            #     "groundtruth_image_labels" not in kwargs
            #     or prediction_field_name not in kwargs
            # ):
            #     continue
            #
            # print(cur_lab_anns.head())
            # print(cur_loc_anns.head())
            # print(cur_preds.head())
            # print(kwargs["groundtruth_image_labels"].classifications[0])
            # # print(kwargs["groundtruth_image_labels"].classifications[1])
            # print(kwargs["groundtruth_detections"].detections[0])
            # # print(kwargs["groundtruth_detections"].detections[1])
            # print(kwargs[prediction_field_name].detections[0])
            # print(kwargs[prediction_field_name].detections[1])
            # assert False, ":ASDF"

            _samples.append(fo.Sample(**kwargs))

    dataset = fo.Dataset(dataset_name)
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
            attributes["Source"] = fo.CategoricalAttribute(value=row.Source)
        return attributes

    return fo.Classifications(
        classifications=[
            fo.Classification(
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
            attributes["Source"] = fo.CategoricalAttribute(value=row.Source)
        for col_name in [
            "IsOccluded",
            "IsTruncated",
            "IsGroupOf",
            "IsDepiction",
            "IsInside",
        ]:
            if col_name in df:
                attributes[col_name] = fo.BooleanAttribute(value=row[col_name])
        return attributes

    return fo.Detections(
        detections=[
            fo.Detection(
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


###############################################################################

if __name__ == "__main__":
    dataset = load_open_images_dataset(
        dataset_name="open-images-v4-test",
        images_dir=IMAGES_DIR,
        bounding_boxes_path=BOUNDING_BOXES_EXPANDED,
        image_labels_path=IMAGE_LABELS_EXPANDED,
        predictions_path=INPUT_PREDICTIONS,
        prediction_field_name="faster_rcnn",
        class_descriptions_path=CLASS_DESCRIPTIONS,
        load_images_with_preds=True,
    )

    dataset.persistent = True

    print(dataset)
    for sample in dataset.view()[:2]:
        print(sample)
