"""
Source identities for whole frames and clips captured from generated views.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId

import fiftyone.core.clips as focl


class SourceReferenceDomain(object):
    """Source identity metadata for membership work without generating a view.

    Args:
        source: the source dataset
        kind: the reference kind
        field (None): the source label field for label clips or trajectories
    """

    def __init__(self, source, kind, field=None):
        self.source = source
        self.kind = kind
        self.field = field


def normalize_reference(reference):
    """Validates source identity independently of the current grid row ID."""
    if not isinstance(reference, dict):
        raise ValueError("A source reference must be an object")
    kind = reference.get("type")
    sample_id = reference.get("sampleId")
    if not ObjectId.is_valid(sample_id):
        raise ValueError("A reference requires a source sample ID")
    result = {"type": kind, "sampleId": str(ObjectId(sample_id))}
    if kind == "frame":
        result["frameNumber"] = _frame_number(reference.get("frameNumber"))
    elif kind == "clip-range":
        support = reference.get("support")
        if not isinstance(support, (list, tuple)) or len(support) != 2:
            raise ValueError("A clip requires an inclusive frame support")
        result["support"] = [_frame_number(n) for n in support]
        if result["support"][0] > result["support"][1]:
            raise ValueError("Clip support must be ordered")
    elif kind in ("clip-label", "trajectory"):
        field = reference.get("field")
        if not isinstance(field, str) or not field or field.startswith("$"):
            raise ValueError("A reference requires its source label field")
        result["field"] = field
        if kind == "clip-label":
            label_id = reference.get("labelId")
            if not ObjectId.is_valid(label_id):
                raise ValueError("A clip requires a source label ID")
            result["labelId"] = str(ObjectId(label_id))
        else:
            label, index = reference.get("label"), reference.get("index")
            if not isinstance(label, str) or (
                index is not None
                and (isinstance(index, bool) or not isinstance(index, int))
            ):
                raise ValueError("A trajectory requires its label and index")
            result.update(label=label, index=index)
    else:
        raise ValueError("Unknown source reference type: %r" % kind)
    return result


def _frame_number(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("Frame numbers must be positive integers")
    return value


def reference_fields(view):
    """The durable fields identifying rows of a generated frame/clip view."""
    if isinstance(view, SourceReferenceDomain):
        if view.kind == "frame":
            return {"frameNumber": "frame_number"}
        if view.kind == "clip-label":
            return {"labelId": "_id"}
        if view.kind == "trajectory":
            field = view.field.removeprefix("frames.")
            return {"label": field + ".label", "index": field + ".index"}
        return {"support": "support"}
    if view._dataset is view._root_dataset:
        return None
    if view._is_frames:
        return {"frameNumber": "frame_number"}
    if view._is_clips:
        if is_trajectory(view):
            field = trajectory_field(view).removeprefix("frames.")
            return {"label": field + ".label", "index": field + ".index"}
        if view._classification_field:
            return {"labelId": "_id"}
        return {"support": "support"}
    return None


def is_trajectory(view):
    """Whether clips represent tracks rather than anonymous frame ranges."""
    return view._is_clips and (
        isinstance(view, focl.TrajectoriesView)
        or bool((view._clips_stage.config or {}).get("trajectories"))
    )


def trajectory_field(view):
    """The source frame label field defining a trajectory view."""
    stage = view._clips_stage
    return (
        stage.field
        if isinstance(view, focl.TrajectoriesView)
        else stage.field_or_expr
    )


def reference_expression(view):
    """A row's canonical Mongo reference, or None for source samples."""
    fields = reference_fields(view)
    if fields is None:
        return None
    field = None
    if isinstance(view, SourceReferenceDomain):
        kind, field = view.kind, view.field
    elif view._is_frames:
        kind = "frame"
    elif is_trajectory(view):
        kind = "trajectory"
        field = trajectory_field(view)
    elif view._classification_field:
        kind = "clip-label"
        field = view._classification_field
    else:
        kind = "clip-range"
    # Match normalize_reference's field order: Mongo object equality includes
    # field order, and membership joins compare these canonical objects.
    result = {
        "type": {"$literal": kind},
        "sampleId": {"$toString": "$_sample_id"},
    }
    if field is not None:
        result["field"] = {"$literal": field}
    for key, path in fields.items():
        value = "$" + path
        if key == "labelId":
            value = {"$toString": value}
        elif key == "index":
            value = {"$ifNull": [value, None]}
        result[key] = value
    return result


def reference_match(view, variable="$$reference"):
    """Indexed source-coordinate match against a captured reference."""
    fields = reference_fields(view)
    conditions = [
        {"$eq": ["$_sample_id", {"$toObjectId": variable + ".sampleId"}]}
    ]
    for key, path in fields.items():
        expected = variable + "." + key
        actual = "$" + path
        if key == "labelId":
            expected = {"$toObjectId": expected}
        conditions.append({"$eq": [actual, expected]})
    return {"$and": conditions}


def row_query(view, reference):
    """Validates the entity domain and returns its materialized row query."""
    expression = reference_expression(view)
    if (
        expression is None
        or reference["type"] != expression["type"]["$literal"]
    ):
        raise ValueError(
            "The source reference belongs to a different entity view"
        )
    if reference.get("field") != expression.get("field", {}).get("$literal"):
        raise ValueError(
            "The source reference belongs to a different label field"
        )
    query = {"_sample_id": ObjectId(reference["sampleId"])}
    for key, path in reference_fields(view).items():
        value = reference[key]
        query[path] = ObjectId(value) if key == "labelId" else value
    return query


def source_lookup(view, reference, name="_fo_parent"):
    """Tests live source availability without relying on a generated cache."""
    source = (
        view.source
        if isinstance(view, SourceReferenceDomain)
        else view._root_dataset
    )
    expression = reference_expression(view)
    kind = expression["type"]["$literal"]
    sample_id = {"$toObjectId": "$$reference.sampleId"}
    pipeline = [{"$match": {"$expr": {"$eq": ["$_id", sample_id]}}}]
    if source.media_type == "group":
        pipeline[0]["$match"]["_media_type"] = "video"
    if kind == "clip-range":
        # Use known video bounds without probing media just to save a range.
        end = {"$arrayElemAt": ["$$reference.support", 1]}
        pipeline.append(
            {
                "$match": {
                    "$expr": {
                        "$lte": [
                            end,
                            {"$ifNull": ["$metadata.total_frame_count", end]},
                        ]
                    }
                }
            }
        )
    elif kind == "clip-label":
        path, is_list = source._get_label_field_root(
            expression["field"]["$literal"]
        )
        label_id = {"$toObjectId": "$$reference.labelId"}
        condition = (
            {"$in": [label_id, {"$ifNull": ["$" + path + "._id", []]}]}
            if is_list
            else {"$eq": ["$" + path + "._id", label_id]}
        )
        pipeline.append({"$match": {"$expr": condition}})
    elif kind in ("frame", "trajectory"):
        if kind == "frame":
            condition = {"$eq": ["$frame_number", "$$reference.frameNumber"]}
        else:
            path, _ = source._get_label_field_root(
                expression["field"]["$literal"]
            )
            path = path.removeprefix("frames.")
            condition = {
                "$anyElementTrue": {
                    "$map": {
                        "input": {"$ifNull": ["$" + path, []]},
                        "as": "label",
                        "in": {
                            "$and": [
                                {
                                    "$eq": [
                                        "$$label.label",
                                        "$$reference.label",
                                    ]
                                },
                                {
                                    "$eq": [
                                        {"$ifNull": ["$$label.index", None]},
                                        "$$reference.index",
                                    ]
                                },
                            ]
                        },
                    }
                }
            }
        pipeline.extend(
            [
                {
                    "$lookup": {
                        "from": source._frame_collection_name,
                        "let": {"reference": "$$reference"},
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$and": [
                                            {
                                                "$eq": [
                                                    "$_sample_id",
                                                    sample_id,
                                                ]
                                            },
                                            condition,
                                        ]
                                    }
                                }
                            },
                            {"$limit": 1},
                            {"$project": {"_id": 1}},
                        ],
                        "as": "_fo_source_frames",
                    }
                },
                {
                    "$match": {
                        "$expr": {
                            "$or": [
                                {"$gt": [{"$size": "$_fo_source_frames"}, 0]},
                                (
                                    {
                                        "$lte": [
                                            "$$reference.frameNumber",
                                            {
                                                "$ifNull": [
                                                    "$metadata.total_frame_count",
                                                    0,
                                                ]
                                            },
                                        ]
                                    }
                                    if kind == "frame"
                                    else False
                                ),
                            ]
                        }
                    }
                },
            ]
        )
    pipeline.append({"$project": {"_id": 1}})
    return {
        "$lookup": {
            "from": source._sample_collection_name,
            "let": {"reference": reference},
            "pipeline": pipeline,
            "as": name,
        }
    }


def iter_members(view):
    """Streams whole entities with source references, deduplicating ranges."""
    expression = reference_expression(view)
    pipeline = [{"$project": {"_id": 1}}]
    if expression is not None:
        pipeline = [{"$project": {"_id": 1, "reference": expression}}]
        # Anonymous duplicate ranges are one saved location. Other entities
        # remain distinct even when their bounds happen to be equal.
        if view._is_clips and not (
            view._classification_field or is_trajectory(view)
        ):
            pipeline.extend(
                [
                    {
                        "$group": {
                            "_id": "$reference",
                            "row": {"$first": "$$ROOT"},
                        }
                    },
                    {"$replaceRoot": {"newRoot": "$row"}},
                    {"$sort": {"_id": 1}},
                ]
            )
    for doc in view._aggregate(pipeline=pipeline).batch_size(1000):
        member = {"episodeId": str(doc["_id"]), "kind": "episode"}
        if expression is not None:
            member["reference"] = normalize_reference(doc["reference"])
        yield member
