"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as voxd


logger = logging.getLogger(__name__)

print("Datasets: %s" % voxd.list_dataset_names())
print()

dataset = voxd.Dataset(name="cifar100")

print("Num samples: %d" % len(dataset))
print()

print("Tags: %s" % dataset.get_tags())
for view in dataset.get_views():
    print("Num '%s' samples: %d" % (view.tag, len(view)))
print()

print("Sample from dataset:")
for sample in dataset.iter_samples():
    print(sample)
    break
print()

print("Sample from dataset 'test' view:")
for sample in dataset.get_view("test").iter_samples():
    print(sample)
    break
