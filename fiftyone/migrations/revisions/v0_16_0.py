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
            field["fields"] = [_make_field_doc(*f) for f in fields]
        elif ftype == "fiftyone.core.fields.EmbeddedDocumentField":
            try:
                coll = db[dataset_dict["sample_collection_name"]]
                field["fields"] = _infer_fields(coll, name, embedded_doc_type)
            except Exception as e:
                print(
                    "Failed to infer schema of sample field '%s' of type "
                    "'%s': %s" % (name, embedded_doc_type, e)
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
                    "Failed to infer schema of frame field '%s' of type "
                    "'%s': %s" % (name, embedded_doc_type, e)
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


def _make_field_doc(name, ftype, subfield):
    if ftype == "fiftyone.core.fields.ObjectIdField":
        db_field = "_" + name
    else:
        db_field = name

    return {
        "_cls": "SampleFieldDocument",
        "name": name,
        "ftype": ftype,
        "subfield": subfield,
        "embedded_doc_type": None,
        "db_field": db_field,
        "fields": [],
    }


def _infer_fields(coll, name, embedded_doc_type):
    fields = _do_infer_fields(coll, name, embedded_doc_type)

    list_field = _LABEL_LIST_FIELDS.get(embedded_doc_type, None)

    for field in fields:
        if (
            list_field is not None
            and field.get("name", None) == list_field
            and field.get("ftype", None) == "fiftyone.core.fields.ListField"
        ):
            list_path = name + "." + list_field
            ltype = embedded_doc_type[:-1]  # remove "s"
            field["subfield"] = "fiftyone.core.fields.EmbeddedDocumentField"
            field["embedded_doc_type"] = ltype
            field["fields"] = _do_infer_fields(
                coll, list_path, ltype, is_list_field=True
            )

    return fields


def _do_infer_fields(coll, path, embedded_doc_type, is_list_field=False):
    pipeline = _build_pipeline(path, is_list_field=is_list_field)
    result = coll.aggregate(pipeline, allowDiskUse=True)
    fields = _parse_result(result)

    default_fields = _DEFAULT_LABEL_FIELDS.get(embedded_doc_type, None)
    if default_fields is not None:
        fields = _merge_fields(fields, default_fields)

    return [_make_field_doc(*f) for f in fields]


def _merge_fields(fields, default_fields):
    merged_fields = default_fields.copy()
    default_names = set(f[0] for f in fields)

    for f in fields:
        if f[0] not in default_names:
            merged_fields.append(f)

    return merged_fields


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
    result = list(result)

    if not result:
        return []

    schema = defaultdict(set)
    for name_and_type in result[0]["schema"]:
        name, mongo_type = name_and_type.split(".", 1)
        if name == "_cls":
            continue

        if mongo_type == "objectId" and name.startswith("_"):
            name = name[1:]  # "_id" -> "id"

        if mongo_type is not None:
            schema[name].add(mongo_type)

    fields = []
    for name, types in schema.items():
        if len(types) == 1:
            ftype = _MONGO_TO_FIFTYONE_TYPES.get(
                next(iter(types)), "fiftyone.core.fields.Field"
            )
            fields.append((name, ftype, None))

    return fields


# format: (name, ftype, subfield)
_METADATA_FIELDS = [
    ("size_bytes", "fiftyone.core.fields.IntField", None),
    ("mime_type", "fiftyone.core.fields.StringField", None),
]

_IMAGE_METADATA_FIELDS = [
    ("size_bytes", "fiftyone.core.fields.IntField", None),
    ("mime_type", "fiftyone.core.fields.StringField", None),
    ("width", "fiftyone.core.fields.IntField", None),
    ("height", "fiftyone.core.fields.IntField", None),
    ("num_channels", "fiftyone.core.fields.IntField", None),
]

_VIDEO_METADATA_FIELDS = [
    ("size_bytes", "fiftyone.core.fields.IntField", None),
    ("mime_type", "fiftyone.core.fields.StringField", None),
    ("frame_width", "fiftyone.core.fields.IntField", None),
    ("frame_height", "fiftyone.core.fields.IntField", None),
    ("frame_rate", "fiftyone.core.fields.FloatField", None),
    ("total_frame_count", "fiftyone.core.fields.IntField", None),
    ("duration", "fiftyone.core.fields.FloatField", None),
    ("encoding_str", "fiftyone.core.fields.StringField", None),
]

_DEFAULT_LABEL_FIELDS = {
    "fiftyone.core.labels.Regression": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("value", "fiftyone.core.fields.FloatField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
    ],
    "fiftyone.core.labels.Classification": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("label", "fiftyone.core.fields.StringField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
        ("logits", "fiftyone.core.fields.VectorField", None),
    ],
    "fiftyone.core.labels.Detection": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("label", "fiftyone.core.fields.StringField", None),
        (
            "bounding_box",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.FloatField",
        ),
        ("mask", "fiftyone.core.fields.ArrayField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
        ("index", "fiftyone.core.fields.IntField", None),
    ],
    "fiftyone.core.labels.Polyline": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("label", "fiftyone.core.fields.StringField", None),
        ("points", "fiftyone.core.fields.PolylinePointsField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
        ("index", "fiftyone.core.fields.IntField", None),
        ("closed", "fiftyone.core.fields.BooleanField", None),
        ("filled", "fiftyone.core.fields.BooleanField", None),
    ],
    "fiftyone.core.labels.Keypoint": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("label", "fiftyone.core.fields.StringField", None),
        ("points", "fiftyone.core.fields.PolylinePointsField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
        ("index", "fiftyone.core.fields.IntField", None),
    ],
    "fiftyone.core.labels.Segmentation": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("mask", "fiftyone.core.fields.ArrayField", None),
    ],
    "fiftyone.core.labels.Heatmap": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("map", "fiftyone.core.fields.ArrayField", None),
        ("range", "fiftyone.core.fields.HeatmapRangeField", None),
    ],
    "fiftyone.core.labels.TemporalDetection": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("label", "fiftyone.core.fields.StringField", None),
        ("support", "fiftyone.core.fields.FrameSupportField", None),
        ("confidence", "fiftyone.core.fields.FloatField", None),
    ],
    "fiftyone.core.labels.GeoLocation": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("point", "fiftyone.core.fields.GeoPointField", None),
        ("line", "fiftyone.core.fields.GeoLineStringField", None),
        ("polygon", "fiftyone.core.fields.GeoPolygonField", None),
    ],
    "fiftyone.core.labels.GeoLocations": [
        ("id", "fiftyone.core.fields.ObjectIdField", None),
        (
            "tags",
            "fiftyone.core.fields.ListField",
            "fiftyone.core.fields.StringField",
        ),
        ("points", "fiftyone.core.fields.GeoMultiPointField", None),
        ("lines", "fiftyone.core.fields.GeoMultiLineStringField", None),
        ("polygons", "fiftyone.core.fields.GeoMultiPolygonField", None),
    ],
}

_LABEL_LIST_FIELDS = {
    "fiftyone.core.labels.Classifications": "classifications",
    "fiftyone.core.labels.Detections": "detections",
    "fiftyone.core.labels.Keypoints": "keypoints",
    "fiftyone.core.labels.Polylines": "polylines",
    "fiftyone.core.labels.TemporalDetections": "detections",
}

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
