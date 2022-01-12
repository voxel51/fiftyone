"""
FiftyOne v0.7.1 admin revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db):
    db.admin.command({"setFeatureCompatibilityVersion": "4.4"})


def down(db):
    db.admin.command({"setFeatureCompatibilityVersion": "4.2"})
