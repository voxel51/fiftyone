"""
FiftyOne v0.16.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    media_type = dataset_dict.get("media_type", None)

    for field in dataset_dict.get("sample_fields", []):
        name = field.get("name", None)
        ftype = field.get("ftype", None)
        embedded_doc_type = field.get("embedded_doc_type", None)

        # Upgrade `metadata` field to `media_type`-aware subclass
        if name == "metadata":
            if media_type == "image":
                embedded_doc_type = "fiftyone.core.metadata.ImageMetadata"
            elif media_type == "video":
                embedded_doc_type = "fiftyone.core.metadata.VideoMetadata"
            else:
                embedded_doc_type = "fiftyone.core.metadata.Metadata"

            field["embedded_doc_type"] = embedded_doc_type

        # Populate embedded field schemas
        if ftype == "fiftyone.core.fields.EmbeddedDocumentField":
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

        # Populate embedded field schemas
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
            field["fields"] = _do_infer_fields(coll, list_path, ltype)
    return fields


def _do_infer_fields(coll, path, embedded_doc_type):
    fields = _DEFAULT_LABEL_FIELDS.get(embedded_doc_type, [])
    return [_make_field_doc(*f) for f in fields]


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


# format: (name, ftype, subfield)
_DEFAULT_LABEL_FIELDS = {
    "fiftyone.core.metadata.Metadata": [
        ("size_bytes", "fiftyone.core.fields.IntField", None),
        ("mime_type", "fiftyone.core.fields.StringField", None),
    ],
    "fiftyone.core.metadata.ImageMetadata": [
        ("size_bytes", "fiftyone.core.fields.IntField", None),
        ("mime_type", "fiftyone.core.fields.StringField", None),
        ("width", "fiftyone.core.fields.IntField", None),
        ("height", "fiftyone.core.fields.IntField", None),
        ("num_channels", "fiftyone.core.fields.IntField", None),
    ],
    "fiftyone.core.metadata.VideoMetadata": [
        ("size_bytes", "fiftyone.core.fields.IntField", None),
        ("mime_type", "fiftyone.core.fields.StringField", None),
        ("frame_width", "fiftyone.core.fields.IntField", None),
        ("frame_height", "fiftyone.core.fields.IntField", None),
        ("frame_rate", "fiftyone.core.fields.FloatField", None),
        ("total_frame_count", "fiftyone.core.fields.IntField", None),
        ("duration", "fiftyone.core.fields.FloatField", None),
        ("encoding_str", "fiftyone.core.fields.StringField", None),
    ],
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
