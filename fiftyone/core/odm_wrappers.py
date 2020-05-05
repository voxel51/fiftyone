"""
TEMP Module for Objects wrapping ODM Document Objects, until they replace
the files (dataset.py, view.py, sample.py, etc.)

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
import fiftyone.core.odm as foo


class Dataset(object):
    def __init__(self, name):
        self.name = name

    def __len__(self):
        return foo.Sample.objects(dataset=self.name).count()

    # def __getitem__(self, sample_id):
    #     return fos.Sample._from_db_dict(
    #         collection=self._c,
    #         d=self._c.find_one({"_id": ObjectId(sample_id)}),
    #     )
    #
    # def __delitem__(self, sample_id):
    #     return fod.delete_one(collection=self._c, document_id=sample_id)

    def iter_samples(self):
        for sample in foo.Sample.objects(dataset=self.name):
            yield sample


class DatasetView(object):
    def __init__(self, dataset):
        self.dataset = dataset
        self._pipeline = []

    def __len__(self):
        raise NotImplementedError("TODO")

    def iter_samples(self):
        raise NotImplementedError("TODO")

    def sample(self, size):
        raise NotImplementedError("TODO")
        stage = {"$sample": {"size": size}}


class Document(object):
    def __init__(self, document: foo.Document):
        self._document = document

    @property
    def id(self):
        """Document ObjectId value.

        - automatically created when added to the database)
        - None, if it has not been added

        The 12-byte ObjectId value consists of:
            - a 4-byte timestamp value, representing the ObjectId’s creation,
              measured in seconds since the Unix epoch
            - a 5-byte random value
            - a 3-byte incrementing counter, initialized to a random value
        """
        return str(self._document.id)

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        return self._document.id.generation_time
