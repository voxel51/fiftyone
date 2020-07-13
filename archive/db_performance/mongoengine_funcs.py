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
import mongoengine


CLIENT = pymongo.MongoClient()
_DEFAULT_DATABASE = "mongoengine"


class MongoEngineMetadata(mongoengine.EmbeddedDocument):
    meta = {"allow_inheritance": True}

    size_bytes = mongoengine.IntField()
    mime_type = mongoengine.StringField()


class MongoEngineSample(mongoengine.Document):
    # The path to the data on disk
    filepath = mongoengine.StringField()
    # filepath = mongoengine.StringField(unique=True)

    # The set of tags associated with the sample
    tags = mongoengine.ListField()
    # tags = mongoengine.ListField(mongoengine.StringField())

    # Metadata about the sample media
    metadata = mongoengine.EmbeddedDocumentField(
        MongoEngineMetadata, null=True
    )


def mongoengine_one(n):
    # pylint: disable=no-member
    CLIENT.drop_database(_DEFAULT_DATABASE)
    count = MongoEngineSample.objects.count()
    assert count == 0, "mongoengine_one count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        MongoEngineSample(
            filepath="test_%d.png" % i,
            tags=["tag1", "tag2"],
            metadata=MongoEngineMetadata(size_bytes=512, mime_type=".png"),
        )
        for i in range(n)
    ]
    for sample in samples:
        sample.save()
    times.append(time.time() - start_time)

    count = MongoEngineSample.objects.count()
    assert count == n, "mongoengine_one count: %d" % count

    # READ
    start_time = time.time()
    samples = [
        MongoEngineSample.objects.get(filepath="test_%d.png" % i)
        for i in range(n)
    ]
    times.append(time.time() - start_time)

    assert len(samples) == n, "mongoengine_one count: %d" % len(samples)

    # UPDATE
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample.filepath = "test_%d.jpg" % i
        sample.tags.append("tag3")
        sample.metadata.size_bytes = 1024
        sample.save()
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    for sample in samples:
        sample.delete()
    times.append(time.time() - start_time)

    count = MongoEngineSample.objects.count()
    assert count == 0, "mongoengine_one count: %d" % count

    return np.array(times)


def mongoengine_many(n):
    # pylint: disable=no-member
    CLIENT.drop_database(_DEFAULT_DATABASE)
    count = MongoEngineSample.objects.count()
    assert count == 0, "mongoframes_many count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        MongoEngineSample(
            filepath="test_%d.png" % i,
            tags=["tag1", "tag2"],
            metadata=MongoEngineMetadata(size_bytes=512, mime_type=".png"),
        )
        for i in range(n)
    ]
    MongoEngineSample.objects.insert(samples)
    times.append(time.time() - start_time)

    count = MongoEngineSample.objects.count()
    assert count == n, "mongoengine_one count: %d" % count

    # READ
    start_time = time.time()
    samples = [sample for sample in MongoEngineSample.objects]
    times.append(time.time() - start_time)

    assert len(samples) == n, "mongoengine_one count: %d" % len(samples)

    # UPDATE
    # @todo(Tyler) is there a batch update???
    start_time = time.time()
    for i, sample in enumerate(samples):
        sample.filepath = "test_%d.jpg" % i
        sample.tags.append("tag3")
        sample.metadata.size_bytes = 1024
        sample.save()
    times.append(time.time() - start_time)

    # DELETE
    start_time = time.time()
    sample_ids = [sample.id for sample in samples]
    MongoEngineSample.objects(id__in=sample_ids).delete()
    times.append(time.time() - start_time)

    count = MongoEngineSample.objects.count()
    assert count == 0, "mongoengine_one count: %d" % count

    return np.array(times)
