import fiftyone as fo
import fiftyone.zoo as foz
import argparse

parser = argparse.ArgumentParser()

parser.add_argument(
    "--dataset", help="Name of a dataset in fiftyone.zoo", required=True
)
parser.add_argument(
    "--max-samples",
    help="Maximum sample to include in the dataset",
    default=12,
)
parser.add_argument(
    "--persistent",
    help="Persist the loaded dataset",
    default=True,
)
parser.add_argument(
    "--clean",
    help="Delete all datasets before loading a dataset",
    default=True,
)

args = parser.parse_args()

dataset_name = args.dataset
max_samples = args.max_samples
clean = args.clean

if clean:
    fo.delete_datasets("*")
else:
    try:
        fo.delete_dataset(f"{dataset_name}-{max_samples}")
    except:
        pass

dataset = foz.load_zoo_dataset(dataset_name, max_samples=int(max_samples))
dataset.persistent = args.persistent
