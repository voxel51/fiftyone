"""

$ mongo51
> use fiftyone
> db.getCollectionNames()
> db.getCollection("o_d_m_document").findOne()

@todo(Tyler) dynamic documents -> reloading from database
"""
import os
from pprint import pprint

import fiftyone.core.dataset as fod

# Dataset is a per-name singleton
dataset = fod.Dataset("my_dataset")
dataset2 = fod.Dataset("my_dataset")
print("Datasets are per-name singletons: %s" % (dataset is dataset2))
print()

print(dataset.summary())
print()

sample = dataset.add_sample(filepath="/path/to/img.jpg", tags=["train"])
print(dataset.summary())
print(sample)
print()

sample = next(dataset.iter_samples())
print(sample)
print()
