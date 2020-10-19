"""
Aggregations.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import eta.core.utils as etau

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


class Aggregation(object):
    """Abstract base class for all aggregations.

    """

    def __init__(self, field_name):
        self._field_name = field_name

    def _to_mongo(self):
        pass

    def validate(self, sample_collection):
        pass


class Count(Aggregation):
    """Counts the items with respect to a field, or the number of samples if
    no field_name is provided.

    Examples:
        @todo
    """

    def __init__(self, field_name=None):
        super().__init__(field_name)

    def _get_output_field(self, view):
        if self._field_name is None:
            return "count"

    def _to_mongo(self, doc):
        if self._field_name is None:
            return [{"$count": "count"}]

    def _get_result(self, d):
        return d["count"]

    def _get_default_result(self):
        return 0


class Bounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class ConfidenceBounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class Labels(Aggregation):
    def __init__(self, field_name):
        pass


class Distinct(Aggregation):
    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_output_field(self, view):
        return "%s-distinct" % self._field_name

    def _to_mongo(self, schema):
        field = schema[self._field_name]
        if field.ftype == etau.get_class_name(fof.ListField):
            if field.subfield == etau.get_class_name(fof.StringField):
                path = "$%s" % self._field_name
                pipeline = [
                    {"$project": {self._field_name: path}},
                    {"$unwind": path},
                    {
                        "$group": {
                            "_id": "None",
                            self._field_name: {"$addToSet": path},
                        }
                    },
                ]
                return pipeline

        if field.ftype == etau.get_class_name(fof.StringField):
            path = "$%s" % self._field_name
            pipeline = [
                {"$project": {self._field_name: path}},
                {
                    "$group": {
                        "_id": "None",
                        self._field_name: {"$addToSet": path},
                    }
                },
            ]
            return pipeline

    def _get_result(self, d):
        return d[self._field_name]

    def _get_default_result(self):
        return []
