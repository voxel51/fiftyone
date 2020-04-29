"""
Drop `fiftyone` database from server

"""
import logging

from pymongo import MongoClient


logger = logging.getLogger(__name__)


client = MongoClient()

print("Databases before: %s" % client.list_database_names())

client.drop_database("fiftyone")

print("Databases after: %s" % client.list_database_names())
