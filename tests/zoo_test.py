import fiftyone as fo

# import fiftyone.core.config as foc
# foc.set_config_settings(default_ml_backend="torch")
# foc.set_config_settings(default_ml_backend="tensorflow")

import fiftyone.core.odm as foo
import fiftyone.zoo as foz


foo.drop_database()

# List available datasets
print(foz.list_zoo_datasets())

# Load a dataset
dataset = foz.load_zoo_dataset("cifar10")

# Print a few random samples from the dataset
view = dataset.default_view().sample(5)
for sample in view:
    label = sample.get_label("ground_truth").label
    print("%s: %s" % (label, sample.filepath))
