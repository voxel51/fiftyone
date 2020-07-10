"""
Analyze Open Images V6

dataset = fo.load_dataset("open-images-V6-validation")

"""
import glob
import os

from PIL import Image, ImageOps
import tensorflow as tf
import tensorflow_hub as hub

import pandas as pd

import fiftyone as fo
import fiftyone.core.utils as fou


SSD = "ssd"
FASTER_RCNN = "faster_rcnn"
GROUND_TRUTH = "detections"

###############################################################################


def load_open_images(split="test"):
    """

    Args:
        split: "validation" or "test"
    """
    dataset_name = "open-images-V6-%s" % split
    if dataset_name in fo.list_dataset_names():
        return fo.load_dataset(dataset_name)

    base_dir = "/Users/tylerganter/data/open-images-dataset"
    images_rel_dir = "images"

    class_descriptions_filename = "class-descriptions-boxable.csv"
    img_labels_filename = (
        "%s-annotations-human-imagelabels-boxable.csv" % split
    )
    bbox_filename = "%s-annotations-bbox.csv" % split

    images_dir = os.path.join(base_dir, images_rel_dir, split)
    class_descriptions_filepath = os.path.join(
        base_dir, class_descriptions_filename
    )
    img_labels_filepath = os.path.join(base_dir, img_labels_filename)
    bbox_filepath = os.path.join(base_dir, bbox_filename)

    class_descriptions = pd.read_csv(
        class_descriptions_filepath, header=None, index_col=0
    )
    image_labels = pd.read_csv(img_labels_filepath)
    bboxes = pd.read_csv(bbox_filepath)

    # map image label MID to descriptive label
    temp = class_descriptions.loc[image_labels["LabelName"], 1]
    temp.index = image_labels.index
    image_labels["LabelName"] = temp

    # map bbox MID to descriptive label
    temp = class_descriptions.loc[bboxes["LabelName"], 1]
    temp.index = bboxes.index
    bboxes["LabelName"] = temp

    dataset = fo.Dataset(dataset_name)

    _samples = []
    img_paths = glob.glob(os.path.join(images_dir, "*.jpg"))
    img_paths = img_paths[:10000]
    with fou.ProgressBar(img_paths) as pb:
        for image_path in pb(img_paths):
            image_id = os.path.splitext(os.path.basename(image_path))[0]

            # parse image labels for this image
            cur_rows = image_labels[image_labels["ImageID"] == image_id]
            cur_image_labels = fo.Classifications(
                classifications=[
                    fo.Classification(
                        label=row.LabelName, confidence=row.Confidence
                    )
                    for _, row in cur_rows.iterrows()
                ]
            )

            # parse bboxes for this image
            cur_rows = bboxes[bboxes["ImageID"] == image_id]
            cur_bboxes = fo.Detections(
                detections=[
                    fo.Detection(
                        label=r.LabelName,
                        confidence=r.Confidence,
                        # [<top-left-x>, <top-right-y>, <width>, <height>]
                        bounding_box=[
                            r.XMin,
                            r.YMin,
                            r.XMax - r.XMin,
                            r.YMax - r.YMin,
                        ],
                    )
                    for _, r in cur_rows.iterrows()
                ]
            )

            _samples.append(
                fo.Sample(
                    filepath=image_path,
                    image_labels=cur_image_labels,
                    detections=cur_bboxes,
                )
            )
    dataset.add_samples(_samples)

    return dataset


class TensorFlowHubDetector:
    model_map = {
        "ssd": "openimages_v4/ssd/mobilenet_v2",
        "faster_rcnn": "faster_rcnn/openimages_v4/inception_resnet_v2",
    }

    def __init__(self, model_name="faster_rcnn"):
        self.model_name = model_name
        module_handle = (
            "https://tfhub.dev/google/%s/1" % self.model_map[model_name]
        )

        self._detector = hub.load(module_handle).signatures["default"]

    def detect(self, img_path, threshold=0.0):
        img = self._load_image(img_path)

        detector_output = self._detector(img)
        detector_output = {
            key: value.numpy() for key, value in detector_output.items()
        }

        boxes = detector_output["detection_boxes"]
        class_entities = detector_output["detection_class_entities"]
        scores = detector_output["detection_scores"]

        _detections = []

        for i, label in enumerate(class_entities):
            ymin, xmin, ymax, xmax = boxes[i, :]
            detection = fo.Detection(
                label=label,
                confidence=scores[i],
                bounding_box=[xmin, ymin, xmax - xmin, ymax - ymin],
            )
            if detection.confidence > threshold:
                _detections.append(detection)

        return fo.Detections(detections=_detections)

    @staticmethod
    def _load_image(img_path, width=256, height=256):
        pil_image = Image.open(img_path)
        pil_image = ImageOps.fit(pil_image, (width, height), Image.ANTIALIAS)
        pil_image_rgb = pil_image.convert("RGB")
        img = tf.keras.preprocessing.image.img_to_array(
            pil_image_rgb, dtype="uint8"
        )
        img = tf.image.convert_image_dtype(img, tf.float32)[tf.newaxis, ...]
        return img


dataset = load_open_images(split="test")


for model_name in [SSD, FASTER_RCNN]:
    detector = TensorFlowHubDetector(model_name=model_name)

    view = dataset.view().match({model_name: {"$exists": False}})

    with fou.ProgressBar(view) as pb:
        for sample in pb(view):
            if (
                detector.model_name in sample.field_names
                and sample[detector.model_name] is not None
            ):
                continue
            sample[detector.model_name] = detector.detect(sample.filepath)
            sample.save()

###############################################################################

dataset = fo.load_dataset("open-images-V6-test")

# dataset.evaluate(prediction_field=SSD, gt_field=GROUND_TRUTH)
dataset.evaluate(prediction_field=FASTER_RCNN, gt_field=GROUND_TRUTH)

threshold = 0.2
field_name = ("%s_T0_2" % (FASTER_RCNN)).replace(".", "_")
for sample in dataset:
    sample[field_name] = fo.Detections(
        detections=[
            det
            for det in sample[FASTER_RCNN].detections
            if det.confidence > threshold
        ]
    )
    sample.save()

###############################################################################

import fiftyone as fo

dataset = fo.load_dataset("oi-V6-test-100")


s = fo.launch_app(dataset=dataset)
