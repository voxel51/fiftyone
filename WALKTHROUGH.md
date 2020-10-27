# Getting Started with FiftyOne

<img alt="01-overivew" src="https://user-images.githubusercontent.com/25985824/97196947-7372f380-1783-11eb-961f-5a33ea8cc21d.png">

Welcome to this walkthrough of [FiftyOne](https://voxel51.com/fiftyone), a
powerful package for dataset curation, analysis, and visualization.

We designed FiftyOne to help CV/ML engineers curate better datasets and train
better models. Based on our own experience and other CV teams we've had the
pleasure of collaborating with, we found that the key to better data and better
models is to _get closer to our datasets_ and understand our data and models at
a deeper level.

However, without the right tools, this process can be time-consuming, requiring
endless custom scripting and data wrangling that doesn't translate between
tasks or scale over time.

We built FiftyOne to solve these challenges, enabling you to:

-   Rapidly experiment with your datasets
-   Visualize your datasets and their annotations/model predictions
-   Understand the strengths and weaknesses of your models

## Overview

In this walkthrough, we'll cover:

-   Installing FiftyOne
-   Loading a dataset
-   Adding model predictions
-   Using the FiftyOne Brain to index your dataset by visual uniqueness
-   Using the App to explore the dataset

FiftyOne has rich documentation
[available online](https://voxel51.com/docs/fiftyone).

There you'll find installation instructions, a user guide that covers the basic
FiftyOne concepts, as well as short recipes and in-depth tutorials that cover
the most common FiftyOne workflows in detail.

The best part is that FiftyOne is open source! Check out the project
[on GitHub](https://github.com/voxel51/fiftyone) where you can leave feedback,
feature requests, bug reports, or even get involved and contribute to the
library!

You can also
[join our Slack community](https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg)
to chat 1-1 with us and the other FiftyOne users.

## Installation

Installing FiftyOne is easy via `pip`:

```
pip install --index https://pypi.voxel51.com fiftyone
```

If you run into any issues with installation, check out the
[installation page](https://voxel51.com/docs/fiftyone/getting_started/install.html).

For this walkthrough, we'll also install PyTorch, so that we can use a
pretrained model to add predictions to our dataset:

```
pip install torch torchvision
```

FiftyOne is designed to integrate naturally into your existing CV/ML workflows.
It plays well with TensorFlow, PyTorch, and your other ML tools such as cloud
storage, cloud compute, experiment tracking, and more.

## Load dataset

Working with datasets in different formats can be a pain. That's why FiftyOne
provides extensive support for loading datasets in many common formats with
just a single line of code. The
[user guide](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/index.html)
provides detailed instructions on this.

In this case, we'll load a public dataset from the
[FiftyOne Dataset Zoo](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/zoo.html):

```py
import fiftyone as fo
import fiftyone.zoo as foz

# Load COCO validation split from the Dataset Zoo
dataset = foz.load_zoo_dataset("coco-2017", split="validation")

print(dataset)
```

```
Name:           coco-2017-validation
Media type:     None
Num samples:    5000
Persistent:     False
Info:           {'classes': ['0', 'person', 'bicycle', ...]}
Tags:           ['validation']
Sample fields:
    media_type:   fiftyone.core.fields.StringField
    filepath:     fiftyone.core.fields.StringField
    tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
```

[Datasets](https://voxel51.com/docs/fiftyone/user_guide/basics.html) are the
core data structure in FiftyOne. A dataset is composed of one or sample
objects, which can contain arbitrary fields, all of which can be dynamically
created, modified, and deleted. Samples can store the path to the source data,
metadata about it, one or more sets of labels (detections, classifications,
etc.), and other data such as numeric fields, dictionaries, arrays, and more.

FiftyOne uses a lightweight non-relational database to store all information
about the dataset **except** the raw data (images, videos, etc), so you can
easily scale to datasets of any size without worrying about RAM constraints on
your machine.

Let's [launch the App](https://voxel51.com/docs/fiftyone/user_guide/app.html)
to visually explore the dataset:

```py
# Explore the dataset in the App
session = fo.launch_app(dataset=dataset)
```

<img alt="02-dataset" src="https://user-images.githubusercontent.com/25985824/97196960-77067a80-1783-11eb-8a57-c28768aed2f0.png">

With the App, you can visualize your samples and their fields either in image
grid view, or by double-clicking an image to enter an expanded sample view,
where you can study individual samples in more detail.

<img alt="03-detail" src="https://user-images.githubusercontent.com/25985824/97196964-779f1100-1783-11eb-8620-cbd867504991.png">

The
[view bar](https://voxel51.com/docs/fiftyone/user_guide/app.html#using-the-view-bar)
allows you to search and filter your dataset to study specific samples or
labels of interest.

With FiftyOne, you can seemlessly transition between the App and Python.

For example, if you perform a search in the App, you can access it from your
Python shell:

```py
# Access the current view in the App
current_view = session.view
```

You can also select samples in the App and access the currently selected
samples from Python:

```py
# [Select samples in the App]

# The currently selected samples
print(session.selected)

# The currently selected samples
selected_view = dataset.select(session.selected)
```

You can also manipulate the App view from Python! For example, you may want to
construct a complex view from code and then open it in the App!

```py
from fiftyone import ViewField as F

# Hide all detections that do not have label `person`, and sort the samples to
# show those with the most people
person_view = (
    dataset
    .filter_detections("ground_truth", F("label") == "person")
    .sort_by(F("ground_truth.detections").length(), reverse=True)
)

print(person_view)

# Show the view in the App
session.view = person_view
```

```
Dataset:        coco-2017-validation
Media type:     None
Num samples:    5000
Tags:           ['validation']
Sample fields:
    media_type:   fiftyone.core.fields.StringField
    filepath:     fiftyone.core.fields.StringField
    tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
Pipeline stages:
    1. FilterDetections(field='ground_truth', filter={'$eq': ['$$this.label', 'person']}, only_matches=False)
    2. SortBy(field_or_expr={'$size': {'$ifNull': [...]}}, reverse=True)
```

<img alt="04-person" src="https://user-images.githubusercontent.com/25985824/97196969-7837a780-1783-11eb-8d48-c1cc95ee33aa.png">

## Index images by uniqueness

FiftyOne includes a `fiftyone.brain` package that provides a collection of
algorithms to help you gain insight into your datasets and models. For more
information,
[check out the user guide](https://voxel51.com/docs/fiftyone/user_guide/brain.html).

Let's use the `compute_uniqueness()` function to index the samples in our
dataset according to their visual uniqueness:

```py
import fiftyone.brain as fob

fob.compute_uniqueness(dataset)
```

Inspecting the dataset shows that a numeric `uniqueness` field has been added
to each sample, which measures its visual uniqueness with respect to the other
samples in the dataset:

```py
print(dataset)
```

```
Name:           coco-2017-validation
Media type:     None
Num samples:    5000
Persistent:     False
Info:           {'classes': ['0', 'person', 'bicycle', ...]}
Tags:           ['validation']
Sample fields:
    media_type:   fiftyone.core.fields.StringField
    filepath:     fiftyone.core.fields.StringField
    tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
    uniqueness:   fiftyone.core.fields.FloatField
```

```py
print(dataset.first())
```

```
<Sample: {
    'id': '5f96eb010b36b7786fbc74f1',
    'media_type': 'image',
    'filepath': '/Users/Brian/fiftyone/coco-2017/validation/data/000001.jpg',
    'tags': BaseList(['validation']),
    'metadata': None,
    'ground_truth': <Detections: {
        'detections': BaseList([
            <Detection: {
                'id': '5f96eb010b36b7786fbc74dd',
                'attributes': BaseDict({
                    'area': <NumericAttribute: {'value': 531.8071000000001}>,
                    'iscrowd': <NumericAttribute: {'value': 0.0}>,
                }),
                'label': 'potted plant',
                'bounding_box': BaseList([
                    0.37028125,
                    0.3345305164319249,
                    0.038593749999999996,
                    0.16314553990610328,
                ]),
                'mask': None,
                'confidence': None,
                'index': None,
            }>,
            ...
        ]),
    }>,
    'uniqueness': 0.44964635189053065,
}>
```

Let's visualize this information in the App by showing the most visually unique
samples first:

```py
# Explore most unique samples
session.view = dataset.sort_by("uniqueness", reverse=True)
```

<img alt="05-unique" src="https://user-images.githubusercontent.com/25985824/97196971-78d03e00-1783-11eb-83ee-05254e13b663.png">

Sorting by **least unique** can help us identify near duplicate samples in our
dataset. This can be useful in situations where you need to send a dataset for
annotation and need to select a diverse set of images.

```py
# Explore the least unique samples
session.view = dataset.sort_by("uniqueness")
```

<img alt="06-similar" src="https://user-images.githubusercontent.com/25985824/97196973-78d03e00-1783-11eb-81af-523e0063f4b6.png">

## Add some model predictions

Now let's add some model predictions to our dataset.

First, let's select some samples to process:

```py
# Select the 15 least unique samples to process
predictions_view = dataset.sort_by("uniqueness").limit(15)

print(predictions_view)
```

```
Dataset:        coco-2017-validation
Media type:     None
Num samples:    15
Tags:           ['validation']
Sample fields:
    media_type:   fiftyone.core.fields.StringField
    filepath:     fiftyone.core.fields.StringField
    tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
    uniqueness:   fiftyone.core.fields.FloatField
Pipeline stages:
    1. SortBy(field_or_expr='uniqueness', reverse=False)
    2. Limit(limit=15)
```

We can access the source image at inference time via the `filepath` attribute
of the samples in the view:

```py
for sample in predictions_view:
    print(sample.filepath)
```

FiftyOne integrates naturally with any ML framework. You simply load and
perform inference with your model using your existing code, and then simply add
the predictions to the corresponding samples in the dataset using FiftyOne's
[Label type](https://voxel51.com/docs/fiftyone/user_guide/using_datasets.html#labels)
corresponding to your task (classification, detection, etc).

In this case, we'll load a pretrained Faster R-CNN model made available by
PyTorch and store the predictions in a `faster_rcnn` field of our samples:

```py
from PIL import Image
import torch
import torchvision
from torchvision.transforms import functional as func


def run_inference(sample, model, device, classes):
    """Performs inference on the image at `sample.filepath` and returns the
    predictions in a `fiftyone.core.labels.Detections` instance.
    """
    # Load iamge
    img = Image.open(sample.filepath)
    img_tensor = func.to_tensor(img).to(device)
    _, height, width = img_tensor.shape

    # Perform inference
    predictions = model([img_tensor])[0]
    labels = predictions["labels"].cpu().detach().numpy()
    scores = predictions["scores"].cpu().detach().numpy()
    boxes = predictions["boxes"].cpu().detach().numpy()

    # Convert detections to FiftyOne format
    detections = []
    for label, score, box in zip(labels, scores, boxes):
        # Convert to [top-left-x, top-left-y, width, height] format with
        # relative coordinates in [0, 1] x [0, 1]
        x1, y1, x2, y2 = box
        rel_box = [
            x1 / width, y1 / height, (x2 - x1) / width, (y2 - y1) / height
        ]

        detections.append(
            fo.Detection(
                label=classes[label],
                bounding_box=rel_box,
                confidence=score,
            )
        )

    return fo.Detections(detections=detections)


# Load pre-trained model
model = torchvision.models.detection.fasterrcnn_resnet50_fpn(pretrained=True)
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
model.to(device)
_ = model.eval()

# Add model predictions to dataset
classes = dataset.info["classes"]
with fo.ProgressBar() as pb:
    for sample in pb(predictions_view):
        sample["faster_rcnn"] = run_inference(sample, model, device, classes)
        sample.save()
```

Let's verify that the predictions were added to our dataset by printing a
sample from the `predictions_view` that we created:

```py
# The `faster_rcnn` field of the sample contains the model predictions
print(predictions_view.first())
```

```
<SampleView: {
    'id': '5f96eb0b0b36b7786fbcba15',
    'media_type': 'image',
    'filepath': '/Users/Brian/fiftyone/coco-2017/validation/data/001147.jpg',
    'tags': BaseList(['validation']),
    'metadata': None,
    'ground_truth': <Detections: {
        'detections': BaseList([
            <Detection: {
                'id': '5f96eb0b0b36b7786fbcba0f',
                'attributes': BaseDict({
                    'area': <NumericAttribute: {'value': 207.45490000000035}>,
                    'iscrowd': <NumericAttribute: {'value': 0.0}>,
                }),
                'label': 'horse',
                'bounding_box': BaseList([
                    0.460625,
                    0.7922083333333333,
                    0.039515625,
                    0.04891666666666667,
                ]),
                'mask': None,
                'confidence': None,
                'index': None,
            }>,
            ...
        ]),
    }>,
    'uniqueness': 0.2221618218183157,
    'faster_rcnn': <Detections: {
        'detections': BaseList([
            <Detection: {
                'id': '5f96f0de0b36b7786fbda7d9',
                'attributes': BaseDict({}),
                'label': 'horse',
                'bounding_box': BaseList([
                    0.46101789474487304,
                    0.7977022171020508,
                    0.038655757904052734,
                    0.04035402933756511,
                ]),
                'mask': None,
                'confidence': 0.9759229421615601,
                'index': None,
            }>,
            ...
        ]),
    }>,
}>
```

We can recover the samples with predictions at any time by using the
[Exists stage](https://voxel51.com/docs/fiftyone/api/fiftyone.core.stages.html?highlight=exists#fiftyone.core.stages.Exists)
in the view bar in the App to select samples with a value in their
`faster_rcnn` field:

As usual, we can create the same view via Python code:

```py
# Only show samples with a value in their `faster_rcnn` field
session.view = dataset.exists("faster_rcnn")
```

<img alt="07-pred-grid" src="https://user-images.githubusercontent.com/25985824/97196975-7968d480-1783-11eb-9738-8506078372d2.png">

## Perform some evaluation

With the FiftyOne App, you can visualize the predictions and qualitatively
compare them with the ground truth:

<img alt="08-pred-expanded" src="https://user-images.githubusercontent.com/25985824/97196976-7968d480-1783-11eb-81a6-fd0c9ab424ea.png">

FiftyOne also provides utilities out-of-the-box that let you compute common
quantiative evaluation measures on your detections.

For example, the snippet below uses the
[evaluate_detections()](https://voxel51.com/docs/fiftyone/api/fiftyone.utils.eval.coco.html?highlight=evaluate_detections#fiftyone.utils.eval.coco.evaluate_detections)
utility to compute COCO-style evaluation of the predictions, including
per-sample true positives (TP), false positives (FP), and false negatives (FN)
at an [IoU](https://en.wikipedia.org/wiki/Jaccard_index) of 0.75 (this value is
customizable).

```py
import fiftyone.utils.eval as foue

predictions_view = dataset.exists("faster_rcnn")

# Evaluate the predictions
foue.evaluate_detections(predictions_view, "faster_rcnn")
```

Refreshing the view in the App, we see that additional fields have been added
to each sample to tabulate the evaluation metrics:

```py
# Update the view in the App
session.view = predictions_view
```

<img alt="09-eval-all-grid" src="https://user-images.githubusercontent.com/25985824/97196977-7a016b00-1783-11eb-8d3c-5f822a26b47a.png">

Both visually and quantitatively, we see that the model is generating too many
false positive predictions.

Let's create a view into the dataset with FiftyOne that contains only
predictions with a confidence score of at least 0.8:

```py
from fiftyone import ViewField as F

# Only keep predictions whose confidence is at least 0.8
high_conf_predictions_view = predictions_view.filter_detections(
    "faster_rcnn", F("confidence") > 0.8
)

print(high_conf_predictions_view)
```

```
Dataset:        coco-2017-validation
Media type:     None
Num samples:    15
Tags:           ['validation']
Sample fields:
    media_type:   fiftyone.core.fields.StringField
    filepath:     fiftyone.core.fields.StringField
    tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
    uniqueness:   fiftyone.core.fields.FloatField
    faster_rcnn:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
    tp_iou_0_75:  fiftyone.core.fields.IntField
    fp_iou_0_75:  fiftyone.core.fields.IntField
    fn_iou_0_75:  fiftyone.core.fields.IntField
Pipeline stages:
    1. Exists(field='faster_rcnn', bool=True)
    2. FilterDetections(field='faster_rcnn', filter={'$gt': ['$$this.confidence', 0.8]}, only_matches=False)
```

Don't worry, the lower confidence predictions have not been deleted! They are
just being excluded from the view.

Let's re-run the evaluation method to update the metrics for the
high-confidence-only predictions:

```py
# Re-evaluate
foue.evaluate_detections(high_conf_predictions_view, "faster_rcnn")

# Open the view in the App
session.view = high_conf_predictions_view
```

As we can now see, both visually and quantitatively, the false positive rate of
the model has been decreased!

<img alt="10-eval-high-conf-grid" src="https://user-images.githubusercontent.com/25985824/97196978-7a016b00-1783-11eb-8d6b-5c94611372e6.png">

<img alt="11-eval-high-conf-expanded" src="https://user-images.githubusercontent.com/25985824/97196981-7a016b00-1783-11eb-8f00-0a772d1b92bd.png">

## Next steps

This walkthrough provided just a glimpse into the possibilites of using
FiftyOne to _get closer to your data_.

You can check out common workflows in more detail by checking out:

-   The
    [FiftyOne Tutorials page](https://voxel51.com/docs/fiftyone/tutorials/index.html)
-   The
    [FiftyOne Recipes page](https://voxel51.com/docs/fiftyone/recipes/index.html)
