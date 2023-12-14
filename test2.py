import fiftyone as fo
import fiftyone.zoo as foz
import time

# List available zoo models
model_names = foz.list_zoo_models()
print(model_names)

#
# Load zoo model
#
# This will download the model from the web, if necessary, and ensure
# that any required packages are installed
#
framework = "open-clip"
model_name = "coca_ViT-B-32"
pretrained = "laion2b_s13b_b90k"
model = foz.load_zoo_model(
    name=framework,
    # install_requirements=True,  # If its the first time, yoo need to install the requirements.
    model_name_clip=model_name,
    pretrained=pretrained,
)

#
# Load some samples from the COCO-2017 validation split
#
# This will download the dataset from the web, if necessary
#
dataset = foz.load_zoo_dataset(
    "coco-2017",
    split="validation",
    dataset_name="coco-2017-validation-sample",
    max_samples=50,
    shuffle=True,
)

#
# Choose some samples to process. This can be the entire dataset, or a
# subset of the dataset. In this case, we'll choose some samples at
# random
#
samples = dataset.take(25)

#
# Generate predictions for each sample and store the results in the
# `faster_rcnn` field of the dataset, discarding all predictions with
# confidence below 0.5
#
samples.apply_model(model, label_field="faster_rcnn", confidence_thresh=0.5)
print(samples)

# Visualize predictions in the App
session = fo.launch_app(view=samples)

time.sleep(10000)
