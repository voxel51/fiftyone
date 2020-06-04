import fiftyone as fo

# import fiftyone.core.config as foc
# foc.set_config_settings(default_ml_backend="torch")
# foc.set_config_settings(default_ml_backend="tensorflow")

import fiftyone.zoo as foz


DATASET_NAME = "cifar10"


if DATASET_NAME in fo.list_dataset_names():
    fo.delete_dataset(DATASET_NAME)

# List available datasets
print(foz.list_zoo_datasets())

# Load a dataset
dataset = foz.load_zoo_dataset(DATASET_NAME)

# Print a few random samples from the dataset
view = dataset.view().take(5)
for sample in view:
    label = sample.ground_truth.label
    print("%s: %s" % (label, sample.filepath))
