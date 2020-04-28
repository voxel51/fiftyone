"""
Test if the server is available

"""
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure


client = MongoClient()

try:
    # The ismaster command is cheap and does not require auth.
    client.admin.command("ismaster")
except ConnectionFailure:
    import sys

    sys.exit("Server not available")

print("Server available!")
