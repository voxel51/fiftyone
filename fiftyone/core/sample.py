"""

"""
import os

import eta.core.image as etai
import eta.core.serial as etas


class Sample(etas.Serializable):
    def __init__(self, filepath, partition=None, labels=None):
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.partition = partition
        self.labels = labels

    def add_label(self, label, tag):
        pass


class ImageSample(Sample):
    def __init__(self, metadata=None, *args, **kwargs):
        super(ImageSample, self).__init__(*args, **kwargs)
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)

