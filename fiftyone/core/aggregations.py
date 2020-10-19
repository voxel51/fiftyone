"""
Aggregations.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

import eta.core.serial as etas

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

_LABELS = {fol.Classifications, fol.Detections, fol.Keypoints, fol.Polylines}


class Aggregation(object):
    """Abstract base class for all aggregations.

    """

    def __init__(self, field_name):
        self._field_name = field_name

    def _get_default_result(self):
        raise NotImplementedError(
            "Subclass must implement _get_default_result()"
        )

    def _get_output_field(self, schema, frame_schema):
        raise NotImplementedError(
            "Subclass must implement _get_output_field()"
        )

    def _get_result(self, d):
        raise NotImplementedError("Subclass must implement _get_result()")

    def _to_mongo(self, schema, frame_schema):
        raise NotImplementedError("Subclass must implement _to_mongo()")


class AggregationResult(etas.Serializable):
    """Abstract base class for all aggregation results.

    """

    def __init__(self, name):
        self.name = name

    def __repr__(self):
        d = {}
        for f in self.attributes():
            if f == "name":
                continue
            value = getattr(self, f)
            if isinstance(value, ObjectId):
                d[f] = str(value)
            else:
                d[f] = value

        out = fou.pformat(d)
        return "<%s: %s>" % (self.name, fou.pformat(d))


class AggregationError(RuntimeError):

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
        return CountResult(self._field_name, d["count"])

    def _get_default_result(self):
        return CountResult(self._field_name, 0)


class CountResult(AggregationResult):
    def __init__(self, field_name, count):
        self._field_name = field_name
        self.name = field_name
        if field_name is None:
            self.name = "TotalCount"
        self.count = count


class Bounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class ConfidenceBounds(Aggregation):
    def __init__(self, name, field_name):
        pass


class Distinct(Aggregation):
    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_output_field(self, view):
        return "%s-distinct" % self._field_name

    def _to_mongo(self, schema, frame_schema):
        field = schema[self._field_name]
        if isinstance(field, fof.ListField):
            if isinstance(field.field, fof.StringField):
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

        if isinstance(field, fof.StringField):
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

        raise AggregationError(
            "Distinct: unsupported field '%s' for view" % self._field_name
        )

    def _get_result(self, d):
        return DistinctResult(self._field_name, d[self._field_name])

    def _get_default_result(self):
        return DistinctResult(self._field_name, [])


class DistinctResult(AggregationResult):
    def __init__(self, field_name, values):
        self.name = field_name
        self.values = values


class DistinctLabels(Aggregation):
    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_default_result(self):
        return DistinctLabelsResult(self._field_name, [])

    def _get_output_field(self, view):
        return "%s-distinct-labels" % self._field_name

    def _get_result(self, d):
        return DistinctLabelsResult(self._field_name, d["labels"])

    def _to_mongo(self, schema, frame_schema):
        field = None
        try:
            field = schema[self._field_name]
            path = "$%s" % self._field_name
        except:
            field = frame_schema["frames"][self._field_name]
            path = "$frames.%s" % self._field_name

        if field is None:
            raise AggregationError("field not found")

        if not isinstance(field, fof.EmbeddedDocumentField) or isinstance(
            field.document_type, fol.Label
        ):
            raise AggregationError("not a label")

        pipeline = []

        if field.document_type in _LABELS:
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append(
                {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
            )

        path = "%s.label" % path
        pipeline.append(
            {"$group": {"_id": None, "labels": {"$addToSet": path}}}
        )
        return pipeline


class DistinctLabelsResult(AggregationResult):
    def __init__(self, field_name, labels):
        self.name = field_name
        self.labels = labels
