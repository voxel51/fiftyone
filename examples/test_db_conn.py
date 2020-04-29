"""
Test if the fiftyone MongoDB server is available

"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

import fiftyone  # starts the server!


client = MongoClient()

try:
    # The ismaster command is cheap and does not require auth.
    client.admin.command("ismaster")
except ConnectionFailure:
    import sys

    sys.exit("Server not available")

print("Server available!")
