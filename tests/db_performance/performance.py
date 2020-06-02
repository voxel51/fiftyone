"""
Benchmarking packages


  mongoengine_document_save() 1.066s per 1000 samples (batch size = 100)
  mongoengine_document_save() 0.567s per 1000 samples (batch size = 1000)
  mongoengine_document_save() 0.534s per 1000 samples (batch size = 10000)
  mongoengine_document_save() 0.524s per 1000 samples (batch size = 100000)
       pymodm_document_save() 0.421s per 1000 samples (batch size = 100)
       pymodm_document_save() 0.436s per 1000 samples (batch size = 1000)
       pymodm_document_save() 0.417s per 1000 samples (batch size = 10000)
       pymodm_document_save() 0.427s per 1000 samples (batch size = 100000)
     mongoframes_frame_save() 0.839s per 1000 samples (batch size = 100)
     mongoframes_frame_save() 0.366s per 1000 samples (batch size = 1000)
     mongoframes_frame_save() 0.320s per 1000 samples (batch size = 10000)
     mongoframes_frame_save() 0.320s per 1000 samples (batch size = 100000)
         pymongo_insert_one() 0.804s per 1000 samples (batch size = 100)
         pymongo_insert_one() 0.314s per 1000 samples (batch size = 1000)
         pymongo_insert_one() 0.257s per 1000 samples (batch size = 10000)
         pymongo_insert_one() 0.254s per 1000 samples (batch size = 100000)
         mongoengine_insert() 0.755s per 1000 samples (batch size = 100)
         mongoengine_insert() 0.308s per 1000 samples (batch size = 1000)
         mongoengine_insert() 0.264s per 1000 samples (batch size = 10000)
         mongoengine_insert() 0.271s per 1000 samples (batch size = 100000)
         pymodm_bulk_create() 0.085s per 1000 samples (batch size = 100)
         pymodm_bulk_create() 0.075s per 1000 samples (batch size = 1000)
         pymodm_bulk_create() 0.078s per 1000 samples (batch size = 10000)
         pymodm_bulk_create() 0.100s per 1000 samples (batch size = 100000)
    mongoframes_insert_many() 0.430s per 1000 samples (batch size = 100)
    mongoframes_insert_many() 0.071s per 1000 samples (batch size = 1000)
    mongoframes_insert_many() 0.037s per 1000 samples (batch size = 10000)
    mongoframes_insert_many() 0.039s per 1000 samples (batch size = 100000)
        pymongo_insert_many() 0.434s per 1000 samples (batch size = 100)
        pymongo_insert_many() 0.057s per 1000 samples (batch size = 1000)
        pymongo_insert_many() 0.021s per 1000 samples (batch size = 10000)
        pymongo_insert_many() 0.017s per 1000 samples (batch size = 100000)


| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.odm as foo

from collections import defaultdict
import time

import matplotlib.pyplot as plt
import numpy as np

from pymongo import MongoClient
import mongoengine
import mongoframes
import pymodm

foo.drop_database()

###############################################################################
# PyMongo
###############################################################################


def pymongo_insert_one(n):
    foo.drop_database()
    client = MongoClient()
    db = client.fiftyone
    collection = db["test_pymongo_collection"]
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
    return time.time() - start_time


def pymongo_insert_many(n):
    foo.drop_database()
    client = MongoClient()
    db = client.fiftyone
    collection = db["test_pymongo_collection"]
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
    return time.time() - start_time


###############################################################################
# PyMODM
###############################################################################

# Connect to MongoDB and call the connection "my-app".
pymodm.connection.connect("mongodb://localhost:27017/pymodm_db")


class PyMODMMetadata(pymodm.EmbeddedMongoModel):
    size_bytes = pymodm.fields.IntegerField()
    mime_type = pymodm.fields.CharField()


class PyMODMSample(pymodm.MongoModel):
    filepath = pymodm.fields.CharField()
    tags = pymodm.fields.ListField(field=pymodm.fields.CharField())
    metadata = pymodm.fields.EmbeddedDocumentField(PyMODMMetadata)


def pymodm_document_save(n):
    foo.drop_database()
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
    return time.time() - start_time


def pymodm_bulk_create(n):
    # pylint: disable=no-member
    foo.drop_database()
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
    return time.time() - start_time


###############################################################################
# MongoEngine
###############################################################################


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


def mongoengine_document_save(n):
    foo.drop_database()
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
    return time.time() - start_time


def mongoengine_insert(n):
    # pylint: disable=no-member
    foo.drop_database()
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
    return time.time() - start_time


###############################################################################
# MongoFrames
###############################################################################

# Connect MongoFrames to the database
mongoframes.Frame._client = MongoClient("mongodb://localhost:27017/fiftyone")


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
    foo.drop_database()
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

    # READ
    start_time = time.time()
    samples = [
        MongoFramesSample.one(mongoframes.Q.filepath == "test_%d.png" % i)
        for i in range(n)
    ]
    times.append(time.time() - start_time)

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

    return np.array(times)


def mongoframes_many(n):
    foo.drop_database()
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

    # READ
    start_time = time.time()
    samples = MongoFramesSample.many()
    times.append(time.time() - start_time)

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

    return np.array(times)


###############################################################################

func_map = {
    "pymongo": {"one": pymongo_insert_one, "many": pymongo_insert_many,},
    "pymodm": {"one": pymodm_document_save, "many": pymodm_bulk_create,},
    "mongoengine": {
        "one": mongoengine_document_save,
        "many": mongoengine_insert,
    },
    "mongoframes": {"one": mongoframes_one, "many": mongoframes_many,},
}

###############################################################################

NUM_SAMPLES = [10 ** i for i in range(1, 3)]
OPS = ["create", "read", "update", "delete"]
packages = [
    # "mongoengine",
    # "pymodm",
    "mongoframes",
    # "pymongo"
]
bulk = ["one", "many"]

TIMES = defaultdict(lambda: defaultdict(dict))

for b in bulk:
    for pkg in packages:
        func = func_map[pkg][b]
        times = None
        for n in NUM_SAMPLES:
            if n < 1000:
                rounds = None
                for i in range(11):
                    if rounds is None:
                        rounds = func(n)
                    else:
                        rounds = np.vstack([rounds, func(n)])
                # new_time
                new_time = np.mean(rounds, axis=0)
            else:
                new_time = func(n)

            new_time = new_time * 1000 / n

            if times is None:
                times = np.expand_dims(new_time, axis=0)
            else:
                times = np.vstack([times, new_time])
            print(
                "%27s() %s per 1000 samples (batch size = %d)"
                % (func.__name__, times[-1, :], n)
            )

        for i, op in enumerate(OPS):
            TIMES[op][b][pkg] = times[:, i]

###############################################################################


x = np.arange(len(NUM_SAMPLES))
width = 0.1

fig, axs = plt.subplots(nrows=len(OPS))
if len(OPS) == 1:
    axs = [axs]

for ax, op in zip(axs, OPS):
    i = 0
    for b in bulk:
        for pkg in packages:
            times = TIMES[op][b][pkg]
            L = (len(bulk) * len(packages) - 1) / 2
            rects = ax.bar(
                x + (i - L) * width,
                times,
                width=width,
                label="-".join([pkg, b]),
            )
            i += 1

    # Add some text for labels, title and custom x-axis tick labels, etc.
    ax.set_ylabel("Time per 1000 samples")
    ax.set_title("Processing Time for '%s'" % op)
    ax.set_xticks(x)
    ax.set_xticklabels(NUM_SAMPLES)
    ax.legend()
    ax.set_yscale("log")

plt.show()
