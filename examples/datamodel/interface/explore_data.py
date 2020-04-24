"""
Explore CIFAR100 data in noSQL database

"""
import logging

import fiftyone.core.dataset as voxd

import eta.core.serial as etas


logger = logging.getLogger(__name__)


print("Datasets: %s" % voxd.list_dataset_names())

dataset = voxd.Dataset(name="cifar100")

print("Num samples: %d" % len(dataset))

print("Tags: %s" % dataset.get_tags())

for view in dataset.get_views():
    print("Num '%s' samples: %d" % (view.tag, len(view)))

sample = dataset._c.find_one()
print(etas.pretty_str(sample))
