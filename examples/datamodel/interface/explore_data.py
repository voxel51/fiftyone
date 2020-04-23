"""
Explore CIFAR100 data in noSQL database

"""
import logging

import fiftyone.core.dataset as voxd


logger = logging.getLogger(__name__)


dataset = voxd.Dataset(name="cifar100")

import sys
sys.exit("MADE IT!")

print("Num samples: %d" % dataset.count_documents({}))

partitions = dataset.distinct("partition")
print("Partitions: %s" % partitions)

for partition in partitions:
    print(
        "Num '%s' samples: %d"
        % (partition, dataset.count_documents({"partition": partition}))
    )

sample = dataset.find_one()
print(etas.pretty_str(sample))
