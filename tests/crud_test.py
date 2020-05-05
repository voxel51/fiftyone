"""Testing CRUD Operations (Create, Read, Update, Delete)

"""
import fiftyone.core.dataset as fod
import fiftyone.core.sample as fos

fod.drop_database()
dataset = fod.Dataset("crud_test")

sample = fos.Sample(filepath="nonsense.txt", tags=["tag1", "tag2"],)

print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()

###############################################################################
# Create
###############################################################################

print("Adding sample")
dataset.add_sample(sample)
print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()

###############################################################################
# Create Duplicate
###############################################################################

print("Adding sample with duplicate filepath")
try:
    dataset.add_sample(sample)
except Exception as err:
    print(err)
print("Num samples: %d" % len(dataset))
print()

###############################################################################
# Update 1: add new tag
###############################################################################

print("Adding new tag: 'tag3'")
sample.add_tag("tag3")
print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()

###############################################################################
# Update 2: remove tag
###############################################################################

print("Removing tag 'tag1'")
sample.remove_tag("tag1")
print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()

###############################################################################
# Update 1: add duplicate tag
###############################################################################

print("Adding new tag: 'tag2'")
sample.add_tag("tag2")
print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()

###############################################################################
# Delete
###############################################################################

print("Deleting sample")
del dataset[sample.id]
print("Num samples: %d" % len(dataset))
for sample in dataset.iter_samples():
    print(sample)
print()
