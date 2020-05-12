"""

@todo(Tyler) new collection per dataset??
@todo(Tyler) dynamic documents - reloading from database
"""
import os
from pprint import pprint

import fiftyone as fo
from fiftyone.utils.data import parse_image_classification_dir_tree
import fiftyone.core.iv2 as foiv2

dataset_name = "cifar100_with_duplicates"

src_data_dir = os.path.join("/tmp/fiftyone", dataset_name)

samples, _ = parse_image_classification_dir_tree(src_data_dir)
dataset = fo.Dataset.from_image_classification_samples(
    samples, name=dataset_name
)

sample = next(dataset.iter_samples())
s = sample._backing_doc

dataset = foiv2.Dataset(filepath="/path/to/img.jpg", tags=["train"])

pprint(foiv2.Dataset.get_sample_fields())

asdf = 0
