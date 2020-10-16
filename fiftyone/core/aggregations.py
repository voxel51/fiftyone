"""
Aggregations.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class Aggregation(object):
    """Abstract base class for all aggregations.

    """

    def __init__(self, field_name):
        self._field_name = field_name

    def to_mongo(self):
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

    def _output_field(self, view):
        if self._field_name is None:
            return "count"

    def to_mongo(self):
        if self._field_name is None:
            return [{"$count": "count"}]

    def _from_result(self, result_dict):
        return result_dict["count"]


class Bounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class ConfidenceBounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class Labels(Aggregation):
    def __init__(self, field_name):
        pass


class Values(Aggregation):
    def __init__(self, field_name):
        pass
