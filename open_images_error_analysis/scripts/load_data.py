"""
Analyze Open Images V6

dataset = fo.load_dataset("open-images-V6-validation")

"""
import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))

from error_analysis.load_data import load_open_images_dataset


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "dataset_name", help="Name of the dataset in FiftyOne.",
    )
    parser.add_argument(
        "images_dir",
        help="Directory where images are stored. Images should be in"
        " <open-images-id>.jpg format",
    )
    parser.add_argument(
        "--bounding_boxes_path", default=None, help="TODO",
    )
    parser.add_argument(
        "--image_labels_path", default=None, help="TODO",
    )
    parser.add_argument(
        "--predictions_path", default=None, help="TODO",
    )
    parser.add_argument(
        "--prediction_field_name", default="predicted_detections", help="TODO",
    )
    parser.add_argument(
        "--class_descriptions_path",
        default="predicted_detections",
        help="TODO",
    )
    parser.add_argument(
        "--load_images_with_preds",
        action="store_true",
        default=False,
        help="TODO",
    )
    parser.add_argument(
        "--max_num_images",
        default=-1,
        type=int,
        help="Maximum number of images to load. -1 implies load all images.",
    )
    args = parser.parse_args()

    dataset = load_open_images_dataset(**vars(args))

    # @todo(Tyler)
    # dataset.persistent = True

    print(dataset)
