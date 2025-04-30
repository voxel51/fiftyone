"""
FiftyOne Server /get_similar_labels_frames route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.view as fov
import fiftyone.server.view as fosv
from fiftyone.server.decorators import route


def _build_similar_labels_pipeline(instance_id, field_names_with_instance):
    """
    Builds the aggregation pipeline for finding similar labels across frames.

    Args:
        instance_id: The instance ID to match against
        field_names_with_instance: A list of field names that contain instance fields

    Returns:
        A list of pipeline stages for MongoDB aggregation
    """
    return [
        # Stage 1:
        # Reshape each document by converting the entire document
        # (i.e., $$ROOT) to an array of key-value pairs.
        # Project the frame number and omit the default _id field.
        {
            "$project": {
                "doc": {"$objectToArray": "$$ROOT"},
                "_id": 0,
                "frame_number": 1,
            }
        },
        # Stage 2:
        # Use $facet to perform two parallel pipelines:
        # - "rootLevel": Process spatial labels directly at the root level
        # - "nested": Process spatial labels that are nested inside
        #   list-type fields.
        {
            "$facet": {
                "rootLevel": [
                    # Unwind the array of key-value pairs so each entry
                    # becomes its own document
                    {"$unwind": "$doc"},
                    {
                        # Filter for documents where:
                        # 1. Key is one of the field names in the schema
                        #    that contains an instance field
                        # 2. The label instance matches the specified
                        #    instance id.
                        "$match": {
                            "$and": [
                                {
                                    "doc.k": {
                                        "$in": field_names_with_instance,
                                    },
                                },
                                {"doc.v.instance._id": ObjectId(instance_id)},
                            ],
                        },
                    },
                    # Project a new document containing:
                    # - labelIds: an array with the label's _id.
                    # - frameNumber: the frame number where the label is
                    # found.
                    {
                        "$project": {
                            "labelIds": ["$doc.v._id"],
                            "frameNumber": "$frame_number",
                        }
                    },
                ],
                "nested": [
                    # Unwind the key-value pairs to iterate over possible
                    # nested label structures.
                    {"$unwind": "$doc"},
                    # Filter for documents where the key is one of the field
                    # names in the schema that contains an instance field.
                    {"$match": {"doc.k": {"$in": field_names_with_instance}}},
                    # Project a field "nestedItems" using $switch to choose
                    # the correct nested array field based on the key.
                    # This extracts the array of nested labels (e.g.,
                    # detections, polylines, or keypoints).
                    {
                        "$project": {
                            "nestedItems": {
                                "$ifNull": [
                                    "$doc.v.polylines",
                                    {
                                        "$ifNull": [
                                            "$doc.v.detections",
                                            {
                                                "$ifNull": [
                                                    "$doc.v.keypoints",
                                                    [],
                                                ]
                                            },
                                        ]
                                    },
                                ]
                            },
                            "frameNumber": "$frame_number",
                        }
                    },
                    # From the nested items, filter and transform:
                    # - Use $filter to select items whose
                    #   instance id matches the given instance.
                    # - Use $map to convert each matching label into its
                    #   _id.
                    # The resulting document contains:
                    # - labelIds: an array of label _ids.
                    # - frameNumber: the frame number.
                    {
                        "$project": {
                            "labelIds": {
                                "$map": {
                                    "input": {
                                        "$filter": {
                                            "input": "$nestedItems",
                                            "as": "item",
                                            "cond": {
                                                "$eq": [
                                                    "$$item.instance._id",
                                                    ObjectId(instance_id),
                                                ]
                                            },
                                        }
                                    },
                                    "as": "d",
                                    "in": "$$d._id",
                                }
                            },
                            "frameNumber": 1,
                        }
                    },
                ],
            }
        },
        # Stage 3:
        # Merge the results from the "rootLevel" and "nested" pipelines
        # into one combined array.
        {
            "$project": {
                "combined": {"$concatArrays": ["$rootLevel", "$nested"]}
            }
        },
        # Stage 4:
        # Transform the combined array of label documents into a mapping
        # object.
        # - Use $reduce to iterate over each element and build an array
        #   of key-value pairs.
        # - Each key-value pair maps the label's _id (converted to a
        #   string) to the corresponding frame number.
        # - Finally, use $arrayToObject to convert the array of key-value
        #   pairs into a single object.
        {
            "$project": {
                "labelIdMap": {
                    "$arrayToObject": {
                        "$reduce": {
                            "input": "$combined",
                            "initialValue": [],
                            "in": {
                                "$concatArrays": [
                                    "$$value",
                                    {
                                        "$map": {
                                            "input": "$$this.labelIds",
                                            "as": "labelId",
                                            "in": {
                                                "k": {
                                                    "$toString": "$$labelId"
                                                },
                                                "v": "$$this.frameNumber",
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }
        },
    ]


def _get_filtered_schema(view):
    filtered_schema = {}
    for key, value in view.get_frame_field_schema(flat=True).items():
        while isinstance(value, fof.ListField):
            value = value.field

        if not isinstance(value, fof.EmbeddedDocumentField):
            continue

        if value.document_type in fol._INSTANCE_FIELDS:
            filtered_schema[key] = value

    return filtered_schema


class GetSimilarLabelsFrameCollection(HTTPEndpoint):
    """
    This route scans the frame collection for a given video sample and returns
    a label id map (label_id -> frame_number) for a given instance id.
    """

    @route
    async def post(self, request: Request, data: dict):
        instance_id = data.get("instanceId")

        if not instance_id:
            return JSONResponse(
                {
                    "error": "instanceId is required",
                },
                status_code=400,
            )

        num_frames_str = data.get("numFrames")

        if not num_frames_str:
            return JSONResponse(
                {
                    "error": "numFrames is required",
                },
                status_code=400,
            )

        try:
            num_frames = int(num_frames_str)

            if num_frames <= 0:
                raise ValueError
        except ValueError:
            return JSONResponse(
                {
                    "error": "numFrames must be a positive integer greater than 0",
                },
                status_code=400,
            )

        dataset = data.get("dataset")

        if not dataset:
            return JSONResponse(
                {
                    "error": "dataset is required",
                },
                status_code=400,
            )

        sample_id = data.get("sampleId")

        if not sample_id:
            return JSONResponse(
                {
                    "error": "sampleId is required",
                },
                status_code=400,
            )

        stages = data.get("view", [])
        extended = data.get("extended", None)

        start_frame = 1

        end_frame = num_frames

        support = None if stages else [start_frame, end_frame]

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )

        view = fov.make_optimized_select_view(view, sample_id, flatten=True)

        field_names_with_instance = list(
            map(lambda f: f.split(".")[0], _get_filtered_schema(view))
        )

        post_pipeline = _build_similar_labels_pipeline(
            instance_id, field_names_with_instance
        )

        pipeline = view._pipeline(
            frames_only=True, support=support, post_pipeline=post_pipeline
        )

        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]
        _results = await foo.aggregate(collection, pipeline).to_list(None)
        label_id_map = _results[0]["labelIdMap"] if _results else {}
        return JSONResponse(
            {
                "count": len(label_id_map),
                "instance_id": instance_id,
                "label_id_map": label_id_map,
                "range": [start_frame, end_frame],
            }
        )
