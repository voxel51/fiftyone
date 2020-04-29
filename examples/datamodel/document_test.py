"""Testing the fiftyone.core.document module

"""
import os

import fiftyone.core.dataset as voxd
import fiftyone.core.sample as voxs

voxd.drop_database()
dataset = voxd.Dataset("serializable_test")


# sample_type = voxs.Sample
sample_type = voxs.ImageSample

s = sample_type(
    filepath="/Users/tylerganter/data/fiftyone/as_images/cifar100/test/0.jpg"
)


print("Not in database:")
print(s)
print()

s.write_json("sample.json", pretty_print=True)
s = sample_type.from_json("sample.json")

print("Loaded from disk:")
print(s)
print()

dataset.add_sample(s)
# dataset.add_samples([s])

print("Added to database:")
print(s)
print(type(s.id))
print(type(s.ingest_time))
print()

s = list([s for s in dataset.iter_samples()])[0]

print("Loaded from database:")
print(s)
print(type(s.id))
print(type(s.ingest_time))
print()

s.write_json("sample.json")
s = sample_type.from_json("sample.json")

print("Loaded from disk:")
print(s)
print(type(s.id))
print(type(s.ingest_time))

os.remove("sample.json")
