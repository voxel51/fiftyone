"""
FiftyOne v0.15.0 admin revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db):
    db.admin.command({"setFeatureCompatibilityVersion": "5.0"})


def down(db):
    db.admin.command({"setFeatureCompatibilityVersion": "4.4"})
