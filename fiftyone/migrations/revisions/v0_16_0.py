"""
FiftyOne v0.16.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    media_type = dataset_dict.get("media_type", None)

    for field in dataset_dict.get("sample_fields", []):
        name = field.get("name", None)
        ftype = field.get("ftype", None)
        embedded_doc_type = field.get("embedded_doc_type", None)

        if name == "metadata":
            if media_type == "image":
                embedded_doc_type = "fiftyone.core.metadata.ImageMetadata"
                fields = _IMAGE_METADATA_FIELDS
            elif media_type == "video":
                embedded_doc_type = "fiftyone.core.metadata.VideoMetadata"
                fields = _VIDEO_METADATA_FIELDS
            else:
                embedded_doc_type = "fiftyone.core.metadata.Metadata"
                fields = _METADATA_FIELDS

            field["embedded_doc_type"] = embedded_doc_type
            field["fields"] = [_make_field_doc(n, t) for n, t in fields]
        elif ftype == "fiftyone.core.fields.EmbeddedDocumentField":
            try:
                coll = db[dataset_dict["sample_collection_name"]]
                field["fields"] = _infer_fields(coll, name, embedded_doc_type)
            except Exception as e:
                print(
                    "Failed to infer schema of embedded sample field '%s' "
                    "of type '%s': %s" % (name, embedded_doc_type, e)
                )
                field["fields"] = []
        else:
            field["fields"] = []

    for field in dataset_dict.get("frame_fields", []):
        name = field.get("name", None)
        ftype = field.get("ftype", None)
        embedded_doc_type = field.get("embedded_doc_type", None)

        if ftype == "fiftyone.core.fields.EmbeddedDocumentField":
            try:
                coll = db[dataset_dict["frame_collection_name"]]
                field["fields"] = _infer_fields(coll, name, embedded_doc_type)
            except Exception as e:
                print(
                    "Failed to infer schema of embedded frame field '%s' "
                    "of type '%s': %s" % (name, embedded_doc_type, e)
                )
                field["fields"] = []
        else:
            field["fields"] = []

    dataset_dict["app_sidebar_groups"] = None

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    for field in dataset_dict.get("sample_fields", []):
        if field.get("name", None) == "metadata":
            field["embedded_doc_type"] = "fiftyone.core.metadata.Metadata"

        field.pop("fields", None)

    for field in dataset_dict.get("frame_fields", []):
        field.pop("fields", None)

    dataset_dict.pop("app_sidebar_groups", None)

    db.datasets.replace_one(match_d, dataset_dict)


def _make_field_doc(name, mongo_type):
    ftype = _MONGO_TO_FIFTYONE_TYPES.get(
        mongo_type, "fiftyone.core.fields.Field"
    )

    return {
        "_cls": "SampleFieldDocument",
        "name": name,
        "ftype": ftype,
        "subfield": None,
        "embedded_doc_type": None,
        "db_field": name,
        "fields": [],
    }


def _infer_fields(coll, name, embedded_doc_type):
    fields = _do_infer_fields(coll, name)

    list_field = _LABEL_LIST_FIELDS.get(embedded_doc_type, None)
    has_attrs = embedded_doc_type in _HAS_ATTRIBUTES_DICT

    for field in fields:
        if (
            list_field is not None
            and field.get("name", None) == list_field
            and field.get("ftype", None) == "fiftyone.core.fields.ListField"
        ):
            path = name + "." + list_field
            field["subfield"] = "fiftyone.core.fields.EmbeddedDocumentField"
            field["fields"] = _do_infer_fields(coll, path, is_list_field=True)

        if (
            has_attrs
            and field.get("name", None) == "attributes"
            and field.get("ftype", None) == "fiftyone.core.fields.DictField"
        ):
            path = name + "." + "attributes"
            field["subfield"] = "fiftyone.core.fields.EmbeddedDocumentField"
            field["fields"] = _do_infer_fields(coll, path)

    return fields


def _do_infer_fields(coll, path, is_list_field=False):
    pipeline = _build_pipeline(path, is_list_field=is_list_field)
    result = coll.aggregate(pipeline, allowDiskUse=True)
    schema = _parse_result(result)
    return [_make_field_doc(n, t) for n, t in schema.items()]


def _build_pipeline(path, is_list_field=False):
    pipeline = [{"$project": {path: True}}]

    if is_list_field:
        pipeline.append({"$unwind": "$" + path})

    pipeline.extend(
        [
            {"$project": {"fields": {"$objectToArray": "$" + path}}},
            {"$unwind": "$fields"},
            {
                "$group": {
                    "_id": None,
                    "schema": {
                        "$addToSet": {
                            "$concat": [
                                "$fields.k",
                                ".",
                                {"$type": "$fields.v"},
                            ]
                        }
                    },
                }
            },
        ]
    )

    return pipeline


def _parse_result(result):
    raw_schema = defaultdict(set)
    for name_and_type in result["schema"]:
        name, mongo_type = name_and_type.split(".", 1)
        if mongo_type == "objectId" and name.startswith("_"):
            name = name[1:]  # "_id" -> "id"

        raw_schema[name].add(mongo_type)

    schema = {}
    for name, types in raw_schema.items():
        if len(types) > 1:
            types = [t for t in types if t is not None]
        else:
            types = list(types)

        if len(types) == 1 and types[0] is not None:
            schema[name] = types[0]

    return schema


_METADATA_FIELDS = [
    ("size_bytes", "int"),
    ("mime_type", "string"),
]

_IMAGE_METADATA_FIELDS = [
    ("size_bytes", "int"),
    ("mime_type", "string"),
    ("width", "int"),
    ("height", "int"),
    ("num_channels", "int"),
]

_VIDEO_METADATA_FIELDS = [
    ("size_bytes", "int"),
    ("mime_type", "string"),
    ("frame_width", "int"),
    ("frame_height", "int"),
    ("frame_rate", "double"),
    ("total_frame_count", "int"),
    ("duration", "double"),
    ("encoding_str", "string"),
]

_MONGO_TO_FIFTYONE_TYPES = {
    "string": "fiftyone.core.fields.StringField",
    "bool": "fiftyone.core.fields.BooleanField",
    "int": "fiftyone.core.fields.IntField",
    "long": "fiftyone.core.fields.IntField",
    "double": "fiftyone.core.fields.FloatField",
    "decimal": "fiftyone.core.fields.FloatField",
    "array": "fiftyone.core.fields.ListField",
    "object": "fiftyone.core.fields.DictField",
    "objectId": "fiftyone.core.fields.ObjectIdField",
}

_LABEL_LIST_FIELDS = {
    "fiftyone.core.labels.Classifications": "classifications",
    "fiftyone.core.labels.Detections": "detections",
    "fiftyone.core.labels.Keypoints": "keypoints",
    "fiftyone.core.labels.Polylines": "polylines",
    "fiftyone.core.labels.TemporalDetections": "detections",
}

_HAS_ATTRIBUTES_DICT = (
    "fiftyone.core.labels.Detections",
    "fiftyone.core.labels.Keypoints",
    "fiftyone.core.labels.Polylines",
)
