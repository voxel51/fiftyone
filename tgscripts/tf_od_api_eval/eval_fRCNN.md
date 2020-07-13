# Evaluating a SOTA Model Using Tensorflow Object Detection API

## ?. Install requirements

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

## 1. Download the test data

Follow
[this link](https://storage.googleapis.com/openimages/web/download_v4.html)

-   Test Images (36GB)
-   [x] Boxes (Test)
-   [ ] Image Labels (Test)
-   [ ] Image IDs (Test)
-   [x] Class Names

We also need the
[hierarchy file](https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy.json).

Or just run the following:

```bash
aws s3 --no-sign-request sync s3://open-images-dataset/test [target_dir/test]
```

```bash
wget https://storage.googleapis.com/openimages/2018_04/test/test-annotations-bbox.csv
wget https://storage.googleapis.com/openimages/2018_04/test/test-annotations-human-imagelabels-boxable.csv
wget https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv
wget https://storage.googleapis.com/openimages/2018_04/class-descriptions-boxable.csv
wget https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy.json
```

## 2. Clone tensorflow/models

```bash
git clone https://github.com/tensorflow/models
```

## 3. Create a symlink to the object detection subdirectory

```bash
ln -s /path/to/models/research/object_detection object_detection
```

Finally directory structure:

```
├── images
│   └── test
│       ├── 000026e7ee790996.jpg
│       ├── 000062a39995e348.jpg
│       ├── ...
│       └── fffd0258c243bbea.jpg
├── object_detection -> /Users/tylerganter/source/theta/tensorflow/models/research/object_detection/
└── v4
    ├── bbox_labels_600_hierarchy.json
    ├── class-descriptions-boxable.csv
    ├── test-annotations-bbox.csv
    ├── test-annotations-human-imagelabels-boxable.csv
    └── test-images-with-rotation.csv
```

## 4. Create expanded hierarchy ground-truth labels

```bash
HIERARCHY_FILE=v4/bbox_labels_600_hierarchy.json
BOUNDING_BOXES=v4/test-annotations-bbox
IMAGE_LABELS=v4/test-annotations-human-imagelabels-boxable

python object_detection/dataset_tools/oid_hierarchical_labels_expansion.py \
    --json_hierarchy_file=${HIERARCHY_FILE} \
    --input_annotations=${BOUNDING_BOXES}.csv \
    --output_annotations=${BOUNDING_BOXES}_expanded.csv \
    --annotation_type=1

python object_detection/dataset_tools/oid_hierarchical_labels_expansion.py \
    --json_hierarchy_file=${HIERARCHY_FILE} \
    --input_annotations=${IMAGE_LABELS}.csv \
    --output_annotations=${IMAGE_LABELS}_expanded.csv \
    --annotation_type=2
```

## 101. Evaluate

```bash
INPUT_PREDICTIONS=/path/to/detection_predictions.csv
OUTPUT_METRICS=/path/to/output/metrics/file

python models/research/object_detection/metrics/oid_challenge_evaluation.py \
    --input_annotations_boxes=${BOUNDING_BOXES}_expanded.csv \
    --input_annotations_labels=${IMAGE_LABELS}_expanded.csv \
    --input_class_labelmap=object_detection/data/oid_object_detection_challenge_500_label_map.pbtxt \
    --input_predictions=${INPUT_PREDICTIONS} \
    --output_metrics=${OUTPUT_METRICS}
```

```bash
HIERARCHY_FILE=v4/bbox_labels_600_hierarchy.json
BOUNDING_BOXES=v4/test-annotations-bbox
IMAGE_LABELS=v4/test-annotations-human-imagelabels-boxable
INPUT_PREDICTIONS=v4/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions.csv
OUTPUT_METRICS=output_metrics

python object_detection/metrics/oid_challenge_evaluation.py \
    --input_annotations_boxes=${BOUNDING_BOXES}_expanded.csv \
    --input_annotations_labels=${IMAGE_LABELS}_expanded.csv \
    --input_class_labelmap=object_detection/data/oid_v4_label_map.pbtxt \
    --input_predictions=${INPUT_PREDICTIONS} \
    --output_metrics=${OUTPUT_METRICS}
```
