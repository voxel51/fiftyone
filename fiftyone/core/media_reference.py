"""
The ``media_reference`` field's stored value: which source a sample's media
comes from, and where in that source it is.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.media as fom
from fiftyone.core.odm.embedded_document import EmbeddedDocument


class MediaReference(EmbeddedDocument):
    """Base class for what a sample stores about its media.

    A reference names a media source recorded on the owning dataset and the
    part of it this sample is, as one key: the source's id, then coordinates
    of the kind's own choosing. Everything the source's episodes share --
    where the source is, how its files are laid out -- is stored once on the
    dataset; everything here is this sample's alone.

    Args:
        key: ``<media source id>/<coordinates within the source>``
    """

    meta = {"abstract": True, "allow_inheritance": True}

    key = fof.StringField(required=True)

    @staticmethod
    def source_of(key):
        """The media source a reference key names.

        Args:
            key: a media reference key

        Returns:
            the source id
        """
        return key.partition("/")[0]

    def __setattr__(self, name, value):
        # A reference names one thing; changing part of it would silently
        # repoint the sample, so it is replaced whole or not at all
        if not name.startswith("_") and getattr(self, "_initialised", False):
            raise ValueError(
                "Media references only support whole-value reassignment"
            )

        super().__setattr__(name, value)

    @property
    def source_id(self):
        """The id of the media source on the owning dataset."""
        return self.source_of(self.key)

    @property
    def media_type(self):
        """The media type of every reference-backed sample. A sample of one
        modality names its media by filepath; a reference is what multimodal
        media is named by."""
        return fom.MULTIMODAL

    @property
    def display_name(self):
        """A human-readable name for the referenced media."""
        return self.key
