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

###############################################################################

# dataset = foz.load_zoo_dataset("coco-2014", split="validation")
# dataset = foz.load_zoo_dataset("coco-2017", split="validation")

###############################################################################

dataset = fo.load_dataset("coco-2017-validation")

with detector:
    with fou.ProgressBar(dataset) as pb:
        for sample in pb(dataset.view().take(200)):
            if (
                detector.config.model_name in sample.field_names
                and sample[detector.config.model_name] is not None
            ):
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

###############################################################################

threshold = 0.2
field_name = ("%s_T0_2" % (MODEL_NAME)).replace(".", "_")
for sample in dataset:
    sample[field_name] = fo.Detections(
        detections=[
            det
            for det in sample[MODEL_NAME].detections
            if det.confidence > threshold
        ]
    )
    sample.save()

###############################################################################

dataset.evaluate(prediction_field=MODEL_NAME)

###############################################################################

import fiftyone as fo

dataset = fo.load_dataset("coco-2017-validation")
view = dataset.view().exists("efficientdet-d5")
session = fo.launch_app(view=view)

dataset = fo.load_dataset("coco-2017-validation-200")
session = fo.launch_app(dataset=dataset)


session.view = dataset.view().sort_by("AP")
