"""
Analyze MSCOCO 2017
"""
import eta.core.learning as etal
import eta.core.image as etai

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.core.utils as fou

# MODEL_NAME = "efficientdet-d0"
# MODEL_NAME = "efficientdet-d1"
# MODEL_NAME = "efficientdet-d2"
# MODEL_NAME = "efficientdet-d3"
# MODEL_NAME = "efficientdet-d4"
MODEL_NAME = "efficientdet-d5"
# MODEL_NAME = "efficientdet-d6"

THRESHOLD = 0.0

# Load model
detector = etal.load_default_deployment_model(MODEL_NAME)

# dataset = foz.load_zoo_dataset("coco-2014", split="validation")
# dataset = foz.load_zoo_dataset("coco-2017", split="validation")

dataset = fo.load_dataset("coco-2017-validation")

with detector:
    with fou.ProgressBar(dataset) as pb:
        for sample in pb(dataset):
            if sample[detector.config.model_name] is not None:
                continue

            objects = detector.detect(etai.read(sample.filepath))
            _detections = []
            for obj in objects:
                tlx, tly, brx, bry = obj.bounding_box.to_coords()
                detection = fo.Detection(
                    label=obj.label,
                    bounding_box=[tlx, tly, brx - tlx, bry - tly],
                    confidence=obj.confidence,
                )
                if detection.confidence > THRESHOLD:
                    _detections.append(detection)
            detections = fo.Detections(detections=_detections)
            sample[detector.config.model_name] = detections
            sample.save()

dataset.persistent = True

view = dataset.view().exists("efficientdet-d5")
print(view)

"""
import fiftyone as fo

dataset = fo.load_dataset("coco-2017-validation")
view = dataset.view().exists("efficientdet-d5")
session = fo.launch_app(view=view)
"""
