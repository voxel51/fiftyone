# Error Analysis on Open Images Evaluation Results

## 1. Install requirements

This workflow requires a few required python packages.

Install the appropriate version of `tensorflow` depending on whether or not you
have a GPU:

```bash
pip install tensorflow
# OR
pip install tensorflow-gpu
```

Install other requirements:

```bash
pip install -r requirements.txt
```

## 1. Download the data and ground-truth labels

All of the data can be found on the
[official Open Images website](https://storage.googleapis.com/openimages/web/download_v4.html).

If you are using Open Images V4 you can use the following commands to download
all the necessary files.

### Download the data

**WARNING** This is 36GB of data!

```bash
aws s3 --no-sign-request sync s3://open-images-dataset/test [target_dir/test]
```

### Downloading the labels and metadata

```bash
wget https://storage.googleapis.com/openimages/2018_04/test/test-annotations-bbox.csv
wget https://storage.googleapis.com/openimages/2018_04/test/test-annotations-human-imagelabels-boxable.csv
# wget https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv
wget https://storage.googleapis.com/openimages/2018_04/class-descriptions-boxable.csv
wget https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy.json
```

## 2. Preparing the ground-truth for evaluation

Open Images requires "expanding the hierarchy" if the ground-truth labels, for
evaluation. The labels you downloaded only contain leaf node labels, so for
example, for a bounding box labeled `Jaguar`, the hierarchy expansion would add
duplicate boxes with labels `Carnivore`, `Mammal` and `Animal`.

### Installing TF Object Detection API

The first step is to install the Tensorflow Object Detection API. Instructions
on how to do so can be found
[here](https://github.com/tensorflow/models/blob/master/research/object_detection/g3doc/tf2.md).

### Create expanded hierarchy ground-truth labels

```bash
cd PATH/TO/models/research/object_detection
```

```bash
LABELS_DIR=PATH/TO/LABELS

HIERARCHY_FILE=${LABELS_DIR}/bbox_labels_600_hierarchy.json
BOUNDING_BOXES=${LABELS_DIR}/test-annotations-bbox
IMAGE_LABELS=${LABELS_DIR}/test-annotations-human-imagelabels-boxable

python dataset_tools/oid_hierarchical_labels_expansion.py \
    --json_hierarchy_file=${HIERARCHY_FILE} \
    --input_annotations=${BOUNDING_BOXES}.csv \
    --output_annotations=${BOUNDING_BOXES}_expanded.csv \
    --annotation_type=1

python dataset_tools/oid_hierarchical_labels_expansion.py \
    --json_hierarchy_file=${HIERARCHY_FILE} \
    --input_annotations=${IMAGE_LABELS}.csv \
    --output_annotations=${IMAGE_LABELS}_expanded.csv \
    --annotation_type=2
```

You should now have two new files in `LABELS_DIR`:

```bash
test-annotations-bbox_expanded.csv
test-annotations-human-imagelabels-boxable_expanded.csv
```

## 3. Generating predictions

```bash
cd PATH/TO/open_images_error_analysis
```

```bash
IMAGES_DIR=PATH/TO/IMAGES
OUTPUT_DIR=PATH/TO/PREDICTIONS

MODEL_HANDLE=https://tfhub.dev/google/faster_rcnn/openimages_v4/inception_resnet_v2/1
# MODEL_HANDLE=https://tfhub.dev/google/openimages_v4/ssd/mobilenet_v2/1

python scripts/inference.py \
    --output_dir ${OUTPUT_DIR} \
    --output_format tf_object_detection_api \
    ${IMAGES_DIR} ${MODEL_HANDLE}
```

## 4. Visualizing the data

### Installing FiftyOne

We are going to use the [fiftyone](https://github.com/voxel51/fiftyone) package
for visualizing the data.

```bash
pip install fiftyone
```

### Loading the data into FiftyOne

```bash
DATASET_NAME="open-images-v4-test"
IMAGES_DIR=PATH/TO/IMAGES
BOUNDING_BOXES_EXPANDED=/PATH/TO/test-annotations-bbox_expanded.csv
IMAGE_LABELS_EXPANDED=/PATH/TO/test-annotations-human-imagelabels-boxable_expanded.csv
PREDICTIONS_PATH=/PATH/TO/PREDICTIONS.csv
CLASS_DESCRIPTIONS=/PATH/TO/class-descriptions-boxable.csv

# @todo(Tyler)
DATASET_NAME="open-images-v4-test"
IMAGES_DIR=~/data/open-images-dataset/TESTING/test_images/
BOUNDING_BOXES_EXPANDED=~/data/open-images-dataset/TESTING/test-annotations-bbox_expanded.csv
IMAGE_LABELS_EXPANDED=~/data/open-images-dataset/TESTING/test-annotations-human-imagelabels-boxable_expanded.csv
PREDICTIONS_PATH=~/data/open-images-dataset/TESTING/faster_rcnn_preds_74061.csv
CLASS_DESCRIPTIONS=~/data/open-images-dataset/TESTING/class-descriptions-boxable.csv

python scripts/load_data.py \
    --bounding_boxes_path ${BOUNDING_BOXES_EXPANDED} \
    --image_labels_path ${IMAGE_LABELS_EXPANDED} \
    --predictions_path ${PREDICTIONS_PATH} \
    --prediction_field_name "faster_rcnn" \
    --class_descriptions_path ${CLASS_DESCRIPTIONS} \
    --load_images_with_preds \
    --max_num_images 100 \
    ${DATASET_NAME} ${IMAGES_DIR}
```

### (optional) Visualizing the data

We can optionally visualize the data before evaluating. Open up a `python` or
`ipython` terminal and run the following:

```python
import fiftyone as fo

dataset = fo.load_dataset("open-images-v4-test")

session = fo.launch_app(dataset=dataset)
```

## 5. Evaluating on a per-image granularity

### Running evaluation

## 5. Error analysis
