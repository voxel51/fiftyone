"""
FiftyOne dataset helper.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class DatasetHelper(object):
    def __init__(self, sample_doc_cls):
        self._sample_doc_cls = sample_doc_cls

    @property
    def sample_collection_name(self):
        return self._sample_doc_cls._meta["collection"]

    @property
    def fields(self):
        return self._sample_doc_cls._fields

    def get_field_schema(self, *args, **kwargs):
        return self._sample_doc_cls.get_field_schema(*args, **kwargs)

    def add_field(self, *args, **kwargs):
        return self._sample_doc_cls.add_field(*args, **kwargs)

    def add_implied_field(self, *args, **kwargs):
        return self._sample_doc_cls.add_implied_field(*args, **kwargs)

    def delete_field(self, *args, **kwargs):
        return self._sample_doc_cls.delete_field(*args, **kwargs)

    def drop_collection(self, *args, **kwargs):
        return self._sample_doc_cls.drop_collection(*args, **kwargs)

    def from_dict(self, *args, **kwargs):
        return self._sample_doc_cls.from_dict(*args, **kwargs)
