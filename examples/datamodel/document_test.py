"""Testing the fiftyone.core.document module

"""
import os

import fiftyone.core.dataset as voxd
import fiftyone.core.sample as voxs

voxd.drop_database()
dataset = voxd.Dataset("serializable_test")


##############
# PARAMETERS #
##############


# sample_type = voxs.Sample
sample_type = voxs.ImageSample


###############################################################################
# Sample NOT in database
###############################################################################

s = sample_type(
    filepath="/Users/tylerganter/data/fiftyone/as_images/cifar100/test/0.jpg"
)

print("Not in database:")
print(s)
print("dataset_name: %s %s" % (type(s.dataset_name), s.dataset_name))
print("id: %s %s" % (type(s.id), s.id))
print("ingest_time: %s %s" % (type(s.ingest_time), s.ingest_time))
print()

###############################################################################
# Sample loaded from disk (never in database)
###############################################################################

s.write_json("sample.json", pretty_print=True)
s = sample_type.from_json("sample.json")

print("Loaded from disk:")
print(s)
print("dataset_name: %s %s" % (type(s.dataset_name), s.dataset_name))
print("id: %s %s" % (type(s.id), s.id))
print("ingest_time: %s %s" % (type(s.ingest_time), s.ingest_time))
print()

###############################################################################
# Sample added to database (but NOT read from database)
###############################################################################

dataset.add_sample(s)
# dataset.add_samples([s])

print("Added to database:")
print(s)
print("dataset_name: %s %s" % (type(s.dataset_name), s.dataset_name))
print("id: %s %s" % (type(s.id), s.id))
print("ingest_time: %s %s" % (type(s.ingest_time), s.ingest_time))
print()

###############################################################################
# Sample read from database
###############################################################################

s = next(dataset.iter_samples())

print("Loaded from database:")
print(s)
print("dataset_name: %s %s" % (type(s.dataset_name), s.dataset_name))
print("id: %s %s" % (type(s.id), s.id))
print("ingest_time: %s %s" % (type(s.ingest_time), s.ingest_time))
print()

###############################################################################
# Sample loaded from disk (after reading from database)
###############################################################################

s.write_json("sample.json")
s = sample_type.from_json("sample.json")

print("Loaded from disk:")
print(s)
print("dataset_name: %s %s" % (type(s.dataset_name), s.dataset_name))
print("id: %s %s" % (type(s.id), s.id))
print("ingest_time: %s %s" % (type(s.ingest_time), s.ingest_time))

# CLEANUP #####################################################################

os.remove("sample.json")
