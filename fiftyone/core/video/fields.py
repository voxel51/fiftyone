import mongoengine

import eta.core.video as etav

import fiftyone.core.fields as fof


class VideoLabels(mongoengine.FileField, fof.Field):
    """A video labels field. Stored as file using GridFS.

    Note that MongoDB has a 16MB size limit for documents. Using GridFS allows
    for larger documents.
    """

    def to_mongo(self, value):
        if value is None:
            return None

        return value.serialize()

    def to_python(self, value):
        if value is None or isinstance(value, etav.VideoLabels):
            return value

        return etav.VideoLabels.from_dict(value)

    def validate(self, value):
        if not isinstance(value, (dict, etav.VideoLabels)):
            self.error(
                "Only dicts and `eta.core.video.VideoLabels` instances may be "
                "used in an ImageLabels field"
            )
