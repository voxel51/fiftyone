"""
Benchmarking packages

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.odm as foo
import time
import numpy as np
import pymodm


# Connect to MongoDB and call the connection "my-app".
pymodm.connection.connect("mongodb://localhost:27017/fiftyone")


class PyMODMMetadata(pymodm.EmbeddedMongoModel):
    size_bytes = pymodm.fields.IntegerField()
    mime_type = pymodm.fields.CharField()


class PyMODMSample(pymodm.MongoModel):
    filepath = pymodm.fields.CharField()
    tags = pymodm.fields.ListField(field=pymodm.fields.CharField())
    metadata = pymodm.fields.EmbeddedDocumentField(PyMODMMetadata)


def pymodm_one(n):
    # pylint: disable=no-member
    foo.drop_database()
    count = PyMODMSample.objects.count()
    assert count == 0, "pymodm_one count: %d" % count
    times = []

    # CREATE
    start_time = time.time()
    samples = [
        PyMODMSample(
            filepath="test_%d.png" % i,
            tags=["tag1", "tag2"],
            metadata=PyMODMMetadata(size_bytes=512, mime_type=".png"),
        )
        for i in range(n)
    ]
    for sample in samples:
        sample.save()
    times.append(time.time() - start_time)

    count = PyMODMSample.objects.count()
    assert count == n, "pymodm_one count: %d" % count

    # READ
    start_time = time.time()
    samples = [
        PyMODMSample.objects.get({"filepath": "test_%d.png" % i})
        for i in range(n)
    ]
    times.append(time.time() - start_time)

    assert len(samples) == n, "pymodm_one count: %d" % len(samples)

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

    count = PyMODMSample.objects.count()
    assert count == 0, "pymodm_one count: %d" % count

    return np.array(times)


def pymodm_many(n):
    # pylint: disable=no-member
    foo.drop_database()
    count = PyMODMSample.objects.count()
    assert count == 0, "pymodm_many count: %d" % count

    times = []

    # CREATE
    start_time = time.time()
    samples = [
        PyMODMSample(
            filepath="test_%d.png" % i,
            tags=["tag1", "tag2"],
            metadata=PyMODMMetadata(size_bytes=512, mime_type=".png"),
        )
        for i in range(n)
    ]
    PyMODMSample.objects.bulk_create(samples)
    times.append(time.time() - start_time)

    count = PyMODMSample.objects.count()
    assert count == n, "pymodm_many count: %d" % count

    # READ
    start_time = time.time()
    samples = [sample for sample in PyMODMSample.objects.all()]
    times.append(time.time() - start_time)

    assert len(samples) == n, "pymodm_many count: %d" % len(samples)

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
    sample_ids = [sample._id for sample in samples]

    PyMODMSample.objects.raw({"_id": {"$in": sample_ids}}).delete()
    times.append(time.time() - start_time)

    count = PyMODMSample.objects.count()
    assert count == 0, "pymodm_many count: %d" % count

    return np.array(times)
