"""
Analyze Open Images V6

dataset = fo.load_dataset("open-images-V6-validation")

"""
import glob
import os

from PIL import Image, ImageOps
import tensorflow as tf
import tensorflow_hub as hub
from tensorflow.keras.utils import Progbar


# PARAMETERS ##################################################################

SPLIT = "test"

# Specify Model Handle
# MODEL_HANDLE = "https://tfhub.dev/google/openimages_v4/ssd/mobilenet_v2/1"
MODEL_HANDLE = (
    "https://tfhub.dev/google/faster_rcnn/openimages_v4/inception_resnet_v2/1"
)

NUM_TO_PROCESS = 2

images_dir = "/Users/tylerganter/data/open-images-dataset/images"
object_detection_dir = "/Users/tylerganter/source/theta/tensorflow/models/research/object_detection"
v4_dir = "/Users/tylerganter/data/open-images-dataset/v4"

###############################################################################


class TensorFlowHubDetector:
    def __init__(self, model_handle):
        self.model_handle = model_handle
        self._detector = hub.load(self.model_handle).signatures["default"]

    def detect(self, img_or_path, reshape_output=True):
        """

        Args:
             img_or_path: image tensor or path to image on disk
             reshape_output: whether to reshape to a list of detection
                dictionaries or return the default model output dictionary

        Returns:
            (reshape_output=True) list of detection dictionaries of format:
                [
                    {
                        'Class Entity': b'Food',
                        'Class Label': 193,
                        'Class Name': b'/m/02wbm',
                        'Confidence': 0.70297146,
                        'XMax': 0.75722724,
                        'XMin': 0.028522551,
                        'YMax': 0.9316236,
                        'YMin': 2.9873252e-06,
                    },
                    {
                        'Class Entity': b'Food',
                        'Class Label': 193,
                        'Class Name': b'/m/02wbm',
                        'Confidence': 0.30363163,
                        'XMax': 0.9926388,
                        'XMin': 0.36288354,
                        'YMax': 0.97807735,
                        'YMin': 0.01982515,
                    },
                    ...
                ]

            (reshape_output=False) a dictionary of format:
                {
                    'detection_scores':         ...,
                    'detection_class_labels':   ...,
                    'detection_class_entities': ...,
                    'detection_class_names':    ...,
                    'detection_boxes':          ...,
                }
        """
        if isinstance(img_or_path, str):
            img = self._load_image(img_or_path)
        else:
            img = img_or_path

        detector_output = self._detector(img)
        detector_output = {
            key: value.numpy() for key, value in detector_output.items()
        }

        if reshape_output:
            return self._reshape_output(detector_output)

        return detector_output

    @staticmethod
    def _load_image(img_path, max_width=None, max_height=None):
        """

        :param img_path:
        :param max_width:
        :param max_height:
        :return:
        """
        pil_image = Image.open(img_path)

        # resize if requested
        if max_width and max_height:
            pil_image = ImageOps.fit(
                pil_image, (max_width, max_height), Image.ANTIALIAS
            )

        pil_image_rgb = pil_image.convert("RGB")
        img = tf.keras.preprocessing.image.img_to_array(
            pil_image_rgb, dtype="uint8"
        )
        img = tf.image.convert_image_dtype(img, tf.float32)[tf.newaxis, ...]

        return img

    @staticmethod
    def _reshape_output(detector_output):
        # integer labels
        class_labels = detector_output["detection_class_labels"]
        # MID labels
        class_names = detector_output["detection_class_names"]
        # human interpretable labels
        class_entities = detector_output["detection_class_entities"]
        scores = detector_output["detection_scores"]
        boxes = detector_output["detection_boxes"]

        detections = []
        for i in range(len(class_labels)):
            ymin, xmin, ymax, xmax = boxes[i, :]
            detections.append(
                {
                    "Class Label": class_labels[i],
                    "Class Name": class_names[i],
                    "Class Entity": class_entities[i],
                    "Confidence": scores[i],
                    "XMin": xmin,
                    "XMax": xmax,
                    "YMin": ymin,
                    "YMax": ymax,
                }
            )

        return detections


###############################################################################

if __name__ == "__main__":
    # load detector
    detector = TensorFlowHubDetector(model_handle=MODEL_HANDLE)

    # get list of paths to images
    imgs_pattern = os.path.join(images_dir, "%s/*.jpg" % SPLIT)
    img_paths = glob.glob(imgs_pattern)
    img_paths = img_paths[:NUM_TO_PROCESS]

    pbar = Progbar(len(img_paths))
    for idx, img_path in enumerate(img_paths):
        image_id = os.path.splitext(os.path.basename(img_path))[0]

        from pprint import pprint

        dets = detector.detect(img_path)

        pprint(dets)

        pbar.update(idx)
