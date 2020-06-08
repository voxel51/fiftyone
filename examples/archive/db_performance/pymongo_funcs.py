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


_DEFAULT_DATABASE = "pymongo"


def pymongo_one(n):
    client = pymongo.MongoClient()
    client.drop_database(_DEFAULT_DATABASE)
    db = client.fiftyone
    collection = db["test_pymongo_collection"]

    count = collection.count_documents({})
    assert count == 0, "pymongo_one count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        {
            "filepath": "test_%d.png" % i,
            "tags": ["tag1", "tag2"],
            "metadata": {"size_bytes": 512, "mime_type": ".png"},
        }
        for i in range(n)
    ]
    for sample in samples:
        collection.insert_one(sample)
    times.append(time.time() - start_time)

    count = collection.count_documents({})
    assert count == n, "pymongo_one count: %d" % count

    # READ
    start_time = time.time()
    samples = [
        collection.find_one({"filepath": "test_%d.png" % i}) for i in range(n)
    ]
    times.append(time.time() - start_time)

    assert len(samples) == n, "pymongo_one count: %d" % len(samples)

    # UPDATE
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample["filepath"] = "test_%d.jpg" % i
        sample["tags"].append("tag3")
        sample["metadata"]["size_bytes"] = 1024
        collection.replace_one({"_id": sample["_id"]}, sample)
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    for sample in samples:
        collection.delete_one({"_id": sample["_id"]})
    times.append(time.time() - start_time)

    count = collection.count_documents({})
    assert count == 0, "pymongo_one count: %d" % count

    return np.array(times)


def pymongo_many(n):
    client = pymongo.MongoClient()
    client.drop_database(_DEFAULT_DATABASE)
    db = client.fiftyone
    collection = db["test_pymongo_collection"]

    count = collection.count_documents({})
    assert count == 0, "pymongo_many count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        {
            "filepath": "test_%d.png" % i,
            "tags": [],
            "metadata": {"size_bytes": 512, "mime_type": ".png"},
        }
        for i in range(n)
    ]
    collection.insert_many(samples)
    times.append(time.time() - start_time)

    count = collection.count_documents({})
    assert count == n, "pymongo_many count: %d" % count

    # READ
    start_time = time.time()
    samples = [sample for sample in collection.find({})]
    times.append(time.time() - start_time)

    assert len(samples) == n, "pymongo_many count: %d" % len(samples)

    # UPDATE
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample["filepath"] = "test_%d.jpg" % i
        sample["tags"].append("tag3")
        sample["metadata"]["size_bytes"] = 1024
    requests = [
        pymongo.ReplaceOne({"_id": sample["_id"]}, sample, upsert=False)
        for sample in samples
    ]
    collection.bulk_write(requests)
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    sample_ids = [sample["_id"] for sample in samples]
    collection.delete_many({"_id": {"$in": sample_ids}})
    times.append(time.time() - start_time)

    count = collection.count_documents({})
    assert count == 0, "pymongo_many count: %d" % count

    return np.array(times)
