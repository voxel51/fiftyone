import eta.core.serial as etas

import fiftyone.core.odm as foo
import fiftyone.core.odm_wrappers as foow

foo.drop_database()

dataset_name = "my_dataset"

sample1 = foo.ODMImageSample(
    dataset=dataset_name,
    filepath="path/to/a/file.jpg",
    metadata=foo.ODMImageMetadata(
        size_bytes=1024, mime_type=".jpg", width=32, height=32, num_channels=3,
    ),
    tags=["train", "rand"],
).save()

sample2 = foo.ODMImageSample(
    dataset=dataset_name,
    filepath="path/to/a/another/file.jpg",
    metadata=foo.ODMImageMetadata(
        size_bytes=2048, mime_type=".jpg", width=32, height=32, num_channels=3,
    ),
    tags=["test", "rand"],
).save()


print("Datasets: %s" % foow.list_dataset_names())
print()

dataset = foow.Dataset(name=dataset_name)

print("Num samples: %d" % len(dataset))
print()

print("Tags: %s" % dataset.get_tags())
print()

print("Label Groups: %s" % dataset.get_label_groups())
print()

print("Insight Groups: %s" % dataset.get_insight_groups())
print()

# ID not in dataset
sample_id = "F" * 24
print("Accessing invalid ID: %s" % sample_id)
print(dataset[sample_id])
print()

# ID in dataset
# @todo(Tyler)
sample_id = str(sample2.id)
# sample_id = next(dataset.iter_samples()).id
print("Accessing valid ID: %s" % sample_id)
print(dataset[sample_id])
print()

import sys; sys.exit("SUCCESS")


print("Sample from dataset:")
sample = next(dataset.iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)
print()

# for sample in foo.Sample.objects(dataset="cifar100"):
#     # for sample in Dataset(name="cifar100").iter_samples():
#     obj = etas.load_json(sample.to_json())
#     print(etas.json_to_str(obj))
