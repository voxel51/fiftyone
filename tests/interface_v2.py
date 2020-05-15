"""

$ mongo51
> use fiftyone
> db.getCollectionNames()
> db.getCollection("o_d_m_document").findOne()

@todo(Tyler) dynamic documents -> reloading from database
"""
import os
from pprint import pprint

import fiftyone as fo

# Dataset is a per-name singleton
dataset = fo.Dataset("my_dataset")
dataset2 = fo.Dataset("my_dataset")
dataset3 = fo.Dataset("another_dataset")
print("Datasets are per-name singletons: %s" % (dataset is dataset2))
print(
    "Datasets with different names are different: %s"
    % (dataset is not dataset3)
)
print()

print(dataset.summary())
print()

# sample = fo.Sample(filepath="/path/to/img.jpg", tags=["train"])
# print(sample)

sample = dataset.add_sample(filepath="/path/to/img.jpg", tags=["train"])
print(dataset.summary())
print(sample)
print()

sample = next(dataset.iter_samples())
print(sample)
print()
