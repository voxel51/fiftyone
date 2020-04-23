"""
Explore CIFAR100 data in noSQL database

"""
import logging

from pymongo import MongoClient


logger = logging.getLogger(__name__)


db = MongoClient().fiftyone_database
dataset = db.cifar100

print("Num samples: %d" % dataset.count_documents({}))

partitions = dataset.distinct("partition")
print("Partitions: %s" % partitions)

for partition in partitions:
    print(
        "Num '%s' samples: %d"
        % (partition, dataset.count_documents({"partition": partition}))
    )
