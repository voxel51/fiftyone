"""
Drop CIFAR100 dataset from database

"""
import logging

from pymongo import MongoClient


logger = logging.getLogger(__name__)


db = MongoClient().fiftyone_database

print("Datasets before: %s" % db.list_collection_names())

db.drop_collection("cifar100")

print("Datasets after: %s" % db.list_collection_names())
