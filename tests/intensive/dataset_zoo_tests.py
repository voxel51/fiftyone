"""
Dataset zoo tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo

# import fiftyone.core.config as foc
# foc.set_config_settings(default_ml_backend="torch")
# foc.set_config_settings(default_ml_backend="tensorflow")

import fiftyone.zoo as foz


def test_zoo():
    # List available datasets
    print(foz.list_zoo_datasets())

    # Load a dataset
    dataset = foz.load_zoo_dataset("cifar10", drop_existing_dataset=True)

    # Print the dataset summary
    print(dataset)

    # Print a few random samples from the dataset
    view = dataset.take(5)
    for sample in view:
        label = sample.ground_truth.label
        print("%s: %s" % (label, sample.filepath))


if __name__ == "__main__":
    test_zoo()
