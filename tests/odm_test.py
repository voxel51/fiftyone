import eta.core.serial as etas

import fiftyone.core.odm as foo


class Dataset(object):
    def __init__(self, name):
        self.name = name

    def __len__(self):
        return len(foo.Sample.objects(dataset=self.name))

    def iter_samples(self):
        for sample in foo.Sample.objects(dataset=self.name):
            yield sample


class DatasetView(object):
    def __init__(self, dataset):
        self.dataset = dataset
        self._pipeline = []

    def __len__(self):
        raise NotImplementedError("TODO")

    def iter_samples(self):
        raise NotImplementedError("TODO")

    def sample(self, size):
        raise NotImplementedError("TODO")
        stage = {"$sample": {"size": size}}


class Document(object):
    def __init__(self, document: foo.Document):
        self._document = document

    @property
    def id(self):
        """Document ObjectId value.

        - automatically created when added to the database)
        - None, if it has not been added

        The 12-byte ObjectId value consists of:
            - a 4-byte timestamp value, representing the ObjectId’s creation,
              measured in seconds since the Unix epoch
            - a 5-byte random value
            - a 3-byte incrementing counter, initialized to a random value
        """
        return str(self._document.id)

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        return self._document.id.generation_time


if __name__ == "__main__":
    foo.drop_database()

    sample1 = foo.ImageSample(
        dataset="cifar100",
        filepath="path/to/a/file.jpg",
        metadata=foo.ImageMetadata(
            size_bytes=1024,
            mime_type=".jpg",
            width=32,
            height=32,
            num_channels=3,
        ),
        tags=["train", "rand"],
    ).save()

    sample2 = foo.ImageSample(
        dataset="cifar100",
        filepath="path/to/a/another/file.jpg",
        metadata=foo.ImageMetadata(
            size_bytes=2048,
            mime_type=".jpg",
            width=32,
            height=32,
            num_channels=3,
        ),
        tags=["test", "rand"],
    ).save()

    print(len(Dataset(name="cifar100")))

    for sample in foo.Sample.objects(dataset="cifar100"):
        # for sample in Dataset(name="cifar100").iter_samples():
        obj = etas.load_json(sample.to_json())
        print(etas.json_to_str(obj))
