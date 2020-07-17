"""
Analyze Open Images V6

dataset = fo.load_dataset("open-images-V6-validation")

"""
from fiftyone.utils.tfodeval import load_open_images_dataset


###############################################################################

IMAGES_DIR = "/Users/tylerganter/data/open-images-dataset/images/test"
BOUNDING_BOXES_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-bbox_expanded.csv"
IMAGE_LABELS_EXPANDED = "/Users/tylerganter/data/open-images-dataset/v4/test-annotations-human-imagelabels-boxable_expanded.csv"
INPUT_PREDICTIONS = "/Users/tylerganter/data/open-images-dataset/v4/predictions/google-faster_rcnn-openimages_v4-inception_resnet_v2_predictions/tf_od_api_format/small.csv"
CLASS_DESCRIPTIONS = "/Users/tylerganter/data/open-images-dataset/v4/class-descriptions-boxable.csv"

CLASS_LABELMAP = "/Users/tylerganter/data/open-images-dataset/object_detection/data/oid_v4_label_map.pbtxt"

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
