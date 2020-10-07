"""
FiftyOne v0.6.2 revisions

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo as pm


def up(conn, sample_collection_names):
    colls = set(conn.collection_names())
    for c in colls:
        if c.startswith("frames.") and ".".join(c.split(".")[1:]) not in colls:
            conn[c].drop()

    colls = set(conn.collection_names())


def down(conn, sample_collection_names):
    print("down")
