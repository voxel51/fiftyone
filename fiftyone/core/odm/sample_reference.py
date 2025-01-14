from collections import OrderedDict
from bson import DBRef, ObjectId

from .document import Document, SerializableDocument
from .mixins import DatasetMixin, get_default_fields, NoDatasetMixin

import fiftyone.core.fields as fof
from fiftyone.core.odm.sample import DatasetSampleDocument


class DatasetSampleReferenceDocument(DatasetMixin, Document):
    meta = {"abstract": True}

    _is_frames_doc = False

    id = fof.ObjectIdField(required=True, primary_key=True, db_field="_id")
    _sample_id = fof.ReferenceField(DatasetSampleDocument, required=True)

    created_at = fof.DateTimeField(read_only=True)
    last_modified_at = fof.DateTimeField(read_only=True)
    _dataset_id = fof.ObjectIdField()

    @property
    def _sample_reference(self):
        self._sample_id.reload()
        return self._sample_id

    def get_field(self, field_name):
        if field_name not in ["id", "created_at", "last_modified_at"]:
            try:
                return self._sample_reference.get_field(field_name)
            except AttributeError:
                pass

        return super().get_field(field_name)

    def set_field(self, field_name, value, create=True, validate=True, dynamic=False):
        if field_name in self._sample_reference.field_names:
            raise Exception("read only!!")
        return super().set_field(field_name, value, create, validate, dynamic)


class NoDatasetSampleReferenceDocument(NoDatasetMixin, SerializableDocument):
    _is_frames_doc = False

    # pylint: disable=no-member
    default_fields = DatasetSampleReferenceDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetSampleReferenceDocument, include_private=True
    )

    _sample_reference = None

    def get_field(self, field_name):
        try:
            return self._sample_reference.get_field(field_name)
        except AttributeError:
            pass
        return super().get_field(field_name)

    def set_field(self, field_name, value, create=True, validate=True, dynamic=False):
        if field_name in self._sample_reference.field_names:
            raise Exception("read only!!")
        return super().set_field(field_name, value, create, validate, dynamic)

    def __init__(self, sample, **kwargs):
        assert sample.in_dataset, "Sample must already be in dataset before creating reference"
        kwargs["id"] = kwargs.get("id", None)
        kwargs["media_type"] = sample.media_type
        kwargs["_sample_id"] = DBRef(sample._doc.collection_name, ObjectId(sample.id))

        self._sample_reference = sample

        self._data = OrderedDict()

        for field_name in self.default_fields_ordered:
            value = kwargs.pop(field_name, None)

            if value is None and field_name not in ("id", "_dataset_id", "_sample_id"):
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value
        
        self._data.update(kwargs)
