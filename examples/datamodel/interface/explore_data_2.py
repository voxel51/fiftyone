"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as voxd


logger = logging.getLogger(__name__)

dataset = voxd.Dataset(name="cifar100")

sample_id = next(dataset.iter_samples()).id  # in DB
# sample_id = "F" * 24                         # NOT in DB

print(dataset[sample_id])
