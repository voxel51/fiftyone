import eta.core.serial as etas

import fiftyone.core.odm as foo
import fiftyone.core.odm_wrappers as foow

foo.drop_database()

sample1 = foo.ImageSample(
    dataset="cifar100",
    filepath="path/to/a/file.jpg",
    metadata=foo.ImageMetadata(
        size_bytes=1024, mime_type=".jpg", width=32, height=32, num_channels=3,
    ),
    tags=["train", "rand"],
).save()

sample2 = foo.ImageSample(
    dataset="cifar100",
    filepath="path/to/a/another/file.jpg",
    metadata=foo.ImageMetadata(
        size_bytes=2048, mime_type=".jpg", width=32, height=32, num_channels=3,
    ),
    tags=["test", "rand"],
).save()

print(len(foow.Dataset(name="cifar100")))

for sample in foo.Sample.objects(dataset="cifar100"):
    # for sample in Dataset(name="cifar100").iter_samples():
    obj = etas.load_json(sample.to_json())
    print(etas.json_to_str(obj))
