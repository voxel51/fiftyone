"""
Dataset sample fields.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import mongoengine

_reference_count_field = "reference_count"


class ReferenceCountingGridFSProxy(mongoengine.fields.GridFSProxy):
    """GridFSProxy base that only deletes when there are no references"""

    def copy_from(self, other):
        self.grid_id = other.grid_id
        self._inc_reference_count()
        self._mark_as_changed()

    def delete(self):
        if self.grid_id is None:
            return

        has_more_references = self._test_and_dec_ref_count()
        if has_more_references:
            self.grid_id = None
            self.gridout = None
            self._mark_as_changed()
        else:
            super().delete()

    def put(self, file_obj, **kwargs):
        kwargs.update({_reference_count_field: 1})
        super().put(file_obj, **kwargs)

    def _test_and_dec_ref_count(self):
        db = mongoengine.get_db(self.db_alias)
        file_metadata_collection = f"{self.collection_name}.files"
        update_result = db[file_metadata_collection].update_one(
            {"_id": self.grid_id, _reference_count_field: {"$gt": 1}},
            {"$inc": {_reference_count_field: -1}},
        )
        return update_result.modified_count > 0

    def _inc_reference_count(self):
        db = mongoengine.get_db(self.db_alias)
        file_metadata_collection = f"{self.collection_name}.files"
        # Happy case: Just increment reference count field atomically
        update_result = db[file_metadata_collection].update_one(
            {"_id": self.grid_id, _reference_count_field: {"$exists": True}},
            {"$inc": {_reference_count_field: 1}},
        )
        # Reference count field did not exist before
        if update_result.modified_count <= 0:
            # Where reference count field doesn't exist, set to 2. 1 for this
            #   instance and 1 for the copied-from instance.
            update_result = db[file_metadata_collection].update_one(
                {
                    "_id": self.grid_id,
                    _reference_count_field: {"$exists": False},
                },
                {"$set": {_reference_count_field: 2}},
            )
            # Super rare case: reference count field didn't exist before but
            #   it does now, meaning someone beat us to creating it. So just
            #   make a simple unconditional increment.
            if update_result.modified_count <= 0:
                db[file_metadata_collection].update_one(
                    {"_id": self.grid_id},
                    {"$inc": {_reference_count_field: 1}},
                )

    def write(self, *args, **kwargs):
        raise RuntimeError('Please use "put" method instead')

    def writelines(self, *args, **kwargs):
        raise RuntimeError('Please use "put" method instead')

    def new_file(self, **kwargs):
        raise RuntimeError('Please use "put" method instead')


class SharedFileField(mongoengine.fields.FileField):
    """FileField that shares file references"""

    proxy_class = ReferenceCountingGridFSProxy
