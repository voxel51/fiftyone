# Evaluating Object Detections

This example provides a brief overivew of using FiftyOne to quantitatively and
qualitatively evaluate object detections.

For more details, check out the in-depth
[evaluating object detections tutorial](https://voxel51.com/docs/fiftyone/tutorials/evaluate_detections.html).

## Load dataset

We'll work with the validation split of the
[COCO dataset](https://cocodataset.org/#home), which is conveniently available
in the
[FiftyOne Dataset Zoo](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/zoo.html):

```py
import fiftyone as fo
import fiftyone.zoo as foz

# Load the COCO validation split
# This will download the dataset from the web, if necessary
dataset = foz.load_zoo_dataset("coco-2017", split="validation")

print(dataset)
```

## Adding model predictions

See
[this tutorial section](https://voxel51.com/docs/fiftyone/tutorials/evaluate_detections.html#Add-predictions-to-dataset)
to see how to easily add predictions from your model to a FiftyOne dataset.

The rest of this example assumes that the dataset contains predictions in a
`faster_rcnn` field.

## Visualizing detections in the App

First, lets locate the samples in the dataset that have predictions:

```py
# Get samples that have predictions in the `faster_rcnn` field
predictions_view = dataset.exists("faster_rcnn")

print(predictions_view)
```

and visualize them in the App:

```py
session = fo.launch_app(view=predictions_view)
```

## Evaluating detections

FiftyOne provdies a
[utility method](https://voxel51.com/docs/fiftyone/api/fiftyone.utils.eval.coco.html#fiftyone.utils.eval.coco.evaluate_detections)
that performs COCO-style evaluation on the detections in a dataset/view:

```py
import fiftyone.utils.eval as foue

foue.evaluate_detections(
    predictions_view, "faster_rcnn", gt_field="ground_truth"
)
```

Refreshing the view in the App, we see that additional fields have been added
to each sample to tabulate the evaluation metrics:

```py
# Update the view in the App
session.view = predictions_view
```

Both visually and quantitatively, we see that the model is generating too many
false positive predictions!

## Filtering by confidence threshold

Use the label filters in the App to try different confidence thresholds for the
`predictions` field of the dataset.

Alternatively, you can perform the same
[filtering operation](https://voxel51.com/docs/fiftyone/user_guide/using_views.html#filtering)
via Python code:

```py
from fiftyone import ViewField as F

# Extract detections with confidence >= 0.80
high_conf_predictions_view = predictions_view.filter_detections(
    "faster_rcnn", F("confidence") > 0.80
)

print(high_conf_predictions_view)
```

We can easily verify that the detections do, in fact, have high confidencee:

```py
# Print a sample detection from the view
sample = high_conf_predictions_view.first()
print(sample.faster_rcnn.detections[0])
```

Don't worry, the lower confidence predictions have not been deleted! They are
just being excluded from the view.

Let's re-run the evaluation method to update the metrics for the
high-confidence-only predictions:

```py
# Re-evaluate high confidence-only predictions
foue.evaluate_detections(
    high_conf_predictions_view, "faster_rcnn", gt_field="ground_truth"
)

session.view = high_conf_predictions_view
```

As we can now see, both visually and quantitatively, the false positive rate of
the model has been decreased!

## More advanced filtering operations

The examples below demonstrate some more advanced
[filtering operations](https://voxel51.com/docs/fiftyone/user_guide/using_views.html#filtering)
that you can perform via dataset views:

### Small vs large detections

```py
# Bounding boxes are stored in [top-left-x, top-left-y, width, height] format
# with relative coordinates in [0, 1] x [0, 1]
bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

small_boxes_view = dataset.filter_detections("ground_truth", bbox_area < 0.01)
large_boxes_view = dataset.filter_detections("ground_truth", bbox_area >= 0.01)

# Show small boxes
session.view = small_boxes_view

# Show large boxes
session.view = large_boxes_view
```

Now lets's do the same thing, but omit samples with no detections after
filtering:

```py
# Bounding boxes are stored in [top-left-x, top-left-y, width, height] format
# with relative coordinates in [0, 1] x [0, 1]
bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

small_boxes_view = (
    dataset
    .filter_detections("ground_truth", bbox_area < 0.01)
    .match(F("ground_truth.detections").length() > 0)
)

large_boxes_view = (
    dataset
    .filter_detections("ground_truth", bbox_area >= 0.01)
    .match(F("ground_truth.detections").length() > 0)
)

# Show small boxes
session.view = small_boxes_view

# Show large boxes
session.view = large_boxes_view
```

### Filtering + sorting by label

Now let's show only `person` detections, and show samples with the most people
first:

```py
person_view = (
    dataset
    .filter_detections("ground_truth", F("label") == "person")
    .sort_by(F("ground_truth.detections").length(), reverse=True)
)

session.view = person_view
```
