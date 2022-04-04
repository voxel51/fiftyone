"""
FiftyOne v0.16.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    media_type = dataset_dict.get("media_type", None)

    embedded_doc_inds = []

    for idx, field in enumerate(dataset_dict.get("sample_fields", [])):
        name = field.get("name", None)
        ftype = field.get("dtype", None)

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
        else:
            field["fields"] = []

        if ftype == "fiftyone.core.fields.EmbeddedDocumentField":
            embedded_doc_inds.append(idx)

    for field in dataset_dict.get("frame_fields", []):
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
    return {
        "_cls": "SampleFieldDocument",
        "name": name,
        "ftype": _MONGO_TO_FIFTYONE_TYPES[mongo_type],
        "subfield": None,
        "embedded_doc_type": None,
        "db_field": name,
        "fields": [],
    }


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
