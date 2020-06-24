"""
Benchmarking packages

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo  # start DB service
import time
import numpy as np
import pymongo
import mongoframes


CLIENT = pymongo.MongoClient()
_DEFAULT_DATABASE = "mongoframes"


# Connect MongoFrames to the database
mongoframes.Frame._client = pymongo.MongoClient(
    "mongodb://localhost:27017/fiftyone"
)


class MongoFramesMetadata(mongoframes.SubFrame):
    _fields = {
        "size_bytes",
        "mime_type",
    }


class MongoFramesSample(mongoframes.Frame):
    _fields = {
        "filepath",
        "tags",
        "metadata",
    }


def mongoframes_one(n):
    CLIENT.drop_database(_DEFAULT_DATABASE)
    count = MongoFramesSample.count()
    assert count == 0, "mongoframes_one count: %d" % count
    times = []

    # CREATE
    start_time = time.time()
    samples = [
        MongoFramesSample(
            filepath="test_%d.png" % i,
            tags=["tag1", "tag2"],
            metadata=MongoFramesMetadata(size_bytes=512, mime_type=".png"),
        )
        for i in range(n)
    ]
    for sample in samples:
        sample.insert()
    times.append(time.time() - start_time)

    count = MongoFramesSample.count()
    assert count == n, "mongoframes_one count: %d" % count

    # READ
    start_time = time.time()
    samples = [
        MongoFramesSample.one(mongoframes.Q.filepath == "test_%d.png" % i)
        for i in range(n)
    ]
    times.append(time.time() - start_time)

    assert len(samples) == n, "mongoframes_one count: %d" % len(samples)

    # UPDATE
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample.filepath = "test_%d.jpg" % i
        sample.tags.append("tag3")
        sample.metadata[
            "size_bytes"
        ] = 1024  # @todo(Tyler) why is this a dict?
        sample.update()
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    for sample in samples:
        sample.delete()
    times.append(time.time() - start_time)

    count = MongoFramesSample.count()
    assert count == 0, "mongoframes_one count: %d" % count

    return np.array(times)


def mongoframes_many(n):
    CLIENT.drop_database(_DEFAULT_DATABASE)
    count = MongoFramesSample.count()
    assert count == 0, "mongoframes_many count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        {
            "filepath": "test_%d.png" % i,
            "tags": [],
            "metadata": MongoFramesMetadata(size_bytes=512, mime_type=".png"),
        }
        for i in range(n)
    ]
    MongoFramesSample.insert_many(samples)
    times.append(time.time() - start_time)

    count = MongoFramesSample.count()
    assert count == n, "mongoframes_many count: %d" % count

    # READ
    start_time = time.time()
    samples = [sample for sample in MongoFramesSample.many()]
    times.append(time.time() - start_time)

    assert len(samples) == n, "mongoframes_many count: %d" % len(samples)

    # UPDATE
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample.filepath = "test_%d.jpg" % i
        sample.tags.append("tag3")
        sample.metadata[
            "size_bytes"
        ] = 1024  # @todo(Tyler) why is this a dict?
    MongoFramesSample.update_many(samples)
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    MongoFramesSample.delete_many(samples)
    times.append(time.time() - start_time)

    count = MongoFramesSample.count()
    assert count == 0, "mongoframes_many count: %d" % count

    return np.array(times)
