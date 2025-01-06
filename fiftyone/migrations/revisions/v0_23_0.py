"""
FiftyOne v0.23.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


from bson import ObjectId


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "runs" not in dataset_dict:
        dataset_dict["runs"] = {}

    app_config = dataset_dict.get("app_config", None)
    if app_config is not None:
        color_scheme = app_config.get("color_scheme", None)
        if color_scheme is not None:
            # Generate new ID only if color_scheme exists
            color_scheme["_id"] = ObjectId()
            # Initialize new fields with default values
            color_scheme["color_by"] = color_scheme.get("color_by", "field")
            color_scheme["colorscales"] = color_scheme.get("colorscales", [])
            color_scheme["default_mask_targets_colors"] = color_scheme.get(
                "default_mask_targets_colors", []
            )
            color_scheme["default_colorscale"] = color_scheme.get(
                "default_colorscale", {"name": "viridis", "list": None}
            )
            color_scheme["label_tags"] = color_scheme.get(
                "label_tags", {"fieldColor": None, "valueColors": []}
            )
            color_scheme["multicolor_keypoints"] = color_scheme.get(
                "multicolor_keypoints", False
            )
            color_scheme["opacity"] = color_scheme.get("opacity", 0.7)
            color_scheme["show_skeletons"] = color_scheme.get(
                "show_skeletons", True
            )

            # Handle nested fields within 'fields'
            fields = color_scheme.get("fields", [])
            if fields:
                for field in fields:
                    if field is not None:
                        field.setdefault("maskTargetsColors", [])

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    runs = dataset_dict.pop("runs", None)

    if runs:
        for _id in runs.values():
            db.runs.delete_one({"_id": _id})

    app_config = dataset_dict.get("app_config", None)
    if app_config:
        color_scheme = app_config.get("color_scheme", None)
        if color_scheme:
            # Remove fields added in the newer version
            keys_to_remove = [
                "_id",
                "color_by",
                "colorscales",
                "default_mask_targets_colors",
                "default_colorscale",
                "label_tags",
                "multicolor_keypoints",
                "opacity",
                "show_skeletons",
            ]
            for key in keys_to_remove:
                color_scheme.pop(key, None)

            # Handle nested fields within 'fields'
            fields = color_scheme.get("fields", [])
            if fields:
                for field in fields:
                    if field is not None:
                        field.pop("maskTargetsColors", None)

    db.datasets.replace_one(match_d, dataset_dict)
