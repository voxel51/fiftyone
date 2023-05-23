import fiftyone as fo
import argparse

parser = argparse.ArgumentParser()

parser.add_argument(
    "--dataset", help="Name of a dataset in fiftyone.zoo", required=True
)
args = parser.parse_args()

dataset_name = args.dataset
dataset = fo.load_dataset(dataset_name)
dataset.delete()
