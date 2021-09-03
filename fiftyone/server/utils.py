"""
FiftyOne server utils.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import collections
import json
import mimetypes
import os
import io
import struct
import warnings

import eta.core.video as etav
import PIL.Image

from fiftyone import ViewField as F


FILE_UNKNOWN = "Sorry, don't know how to get size for this file."


class UnknownFileFormat(Exception):
    pass


class UnknownImageFormat(UnknownFileFormat):
    pass


def change_sample_tags(sample_collection, changes):
    """Applies the changes to tags to all samples of the collection, if
    necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all samples, if necessary. A ``False`` value
            removes the tag from all samples, if necessary
    """
    if not changes:
        return

    tag_expr = _get_tag_expr(changes)
    edit_fcn = _get_tag_modifier(changes)
    sample_collection.match(tag_expr)._edit_sample_tags(edit_fcn)


def change_label_tags(sample_collection, changes, label_fields=None):
    """Applies the changes to tags to all labels in the specified label
    field(s) of the collection, if necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all labels, if necessary. A ``False`` value removes
            the tag from all labels, if necessary
        label_fields (None): an optional name or iterable of names of
            :class:`fiftyone.core.labels.Label` fields. By default, all label
            fields are used
    """
    if not changes:
        return

    if label_fields is None:
        label_fields = sample_collection._get_label_fields()

    tag_expr = _get_tag_expr(changes)
    edit_fcn = _get_tag_modifier(changes)

    for label_field in label_fields:
        tag_view = sample_collection.select_fields(label_field).filter_labels(
            label_field, tag_expr
        )
        tag_view._edit_label_tags(edit_fcn, label_fields=[label_field])


def _get_tag_expr(changes):
    tag_exprs = []
    for tag, add in changes.items():
        if add:
            # We need to tag objects that don't contain the tag
            tag_exprs.append(~F("tags").contains(tag))
        else:
            # We need to untag objects that do contain the tag
            tag_exprs.append(F("tags").contains(tag))

    if any(changes.values()):
        # If no tags exist, we'll always have to add
        tag_expr = F.any([F("tags") == None] + tag_exprs)
    else:
        # We're only deleting tags, so we skip objects with no tags
        tag_expr = (F("tags") != None) & F.any(tag_exprs)

    return tag_expr


def _get_tag_modifier(changes):
    def edit_tags(tags):
        if not tags:
            return [tag for (tag, add) in changes.items() if add]

        for tag, add in changes.items():
            if add and tag not in tags:
                tags = tags + [tag]
            elif not add and tag in tags:
                tags = [t for t in tags if t != tag]

        return tags

    return edit_tags


def read_metadata(filepath, metadata=None):
    """
    Calculates the metadata for a specified media file

    Args:
        filepath: path to the file
        metadata (None): existing metadata dict

    Returns:
        dict
    """
    mimetype, _ = mimetypes.guess_type(filepath)
    if mimetype.startswith("video/"):
        if metadata:
            width = metadata.get("frame_width", None)
            height = metadata.get("frame_height", None)
            frame_rate = metadata.get("frame_rate", None)

            if width and height and frame_rate:
                return {
                    "width": width,
                    "height": height,
                    "frame_rate": frame_rate,
                }

        return read_video_metadata(filepath)

    if metadata:
        width = metadata.get("width", None)
        height = metadata.get("height", None)

        if width and height:
            return {"width": width, "height": height}

    return read_image_metadata(filepath)


def read_image_metadata(filepath):
    """
    Calculates the metadata for a specified image

    Args:
        filepath (str): path to the file

    Returns:
        dict
    """
    try:
        width, height = get_image_size(filepath)
        return {"width": width, "height": height}
    except:
        return {
            "width": 512,
            "height": 512,
        }


def read_video_metadata(filepath):
    """
    Calculates the metadata for a video

    Args:
        filepath (str): path to the file

    Returns:
        dict
    """
    try:
        info = etav.VideoStreamInfo.build_for(filepath)
        return {
            "width": info.frame_size[0],
            "height": info.frame_size[1],
            "frame_rate": info.frame_rate,
        }
    except:
        return {"width": 512, "height": 512, "frame_rate": 30}


types = collections.OrderedDict()
BMP = types["BMP"] = "BMP"
GIF = types["GIF"] = "GIF"
ICO = types["ICO"] = "ICO"
JPEG = types["JPEG"] = "JPEG"
PNG = types["PNG"] = "PNG"
TIFF = types["TIFF"] = "TIFF"

image_fields = ["path", "type", "file_size", "width", "height"]


class Image(collections.namedtuple("Image", image_fields)):
    def to_str_row(self):
        return "%d\t%d\t%d\t%s\t%s" % (
            self.width,
            self.height,
            self.file_size,
            self.type,
            self.path.replace("\t", "\\t"),
        )

    def to_str_row_verbose(self):
        return "%d\t%d\t%d\t%s\t%s\t##%s" % (
            self.width,
            self.height,
            self.file_size,
            self.type,
            self.path.replace("\t", "\\t"),
            self,
        )

    def to_str_json(self, indent=None):
        return json.dumps(self._asdict(), indent=indent)


def get_image_size(file_path):
    """
    Return (width, height) for a given img file content - no external
    dependencies except the os and struct builtin modules
    """
    try:
        img = get_image_data(file_path)
        return (img.width, img.height)
    except UnknownImageFormat:
        return _get_image_size_pil(file_path)


def get_image_size_from_bytesio(input, size):
    """
    Return (width, height) for a given img file content - no external
    dependencies except the os and struct builtin modules
    Args:
        input (io.IOBase): io object support read & seek
        size (int): size of buffer in byte
    """
    try:
        img = get_image_data_from_bytesio(input, size)
        return (img.width, img.height)
    except UnknownImageFormat:
        return _get_image_size_pil(input)


def _get_image_size_pil(file):
    try:
        with PIL.Image.open(file) as image:
            return image.size
    except IOError as e:
        raise UnknownImageFormat(e)


def get_image_data(file_path):
    """
    Return an `Image` object for a given img file content - no external
    dependencies except the os and struct builtin modules
    Args:
        file_path (str): path to an image file
    Returns:
        Image: (path, type, file_size, width, height)
    """
    size = os.path.getsize(file_path)

    # be explicit with open arguments - we need binary mode
    with io.open(file_path, "rb") as input:
        return get_image_data_from_bytesio(input, size, file_path)


def get_image_data_from_bytesio(input, size, file_path=None):
    """
    Return an `Image` object for a given img file content - no external
    dependencies except the os and struct builtin modules
    Args:
        input (io.IOBase): io object support read & seek
        size (int): size of buffer in byte
        file_path (str): path to an image file
    Returns:
        Image: (path, type, file_size, width, height)
    """
    height = -1
    width = -1
    data = input.read(26)
    msg = " raised while trying to decode as JPEG."

    if (size >= 10) and data[:6] in (b"GIF87a", b"GIF89a"):
        # GIFs
        imgtype = GIF
        w, h = struct.unpack("<HH", data[6:10])
        width = int(w)
        height = int(h)
    elif (
        (size >= 24)
        and data.startswith(b"\211PNG\r\n\032\n")
        and (data[12:16] == b"IHDR")
    ):
        # PNGs
        imgtype = PNG
        w, h = struct.unpack(">LL", data[16:24])
        width = int(w)
        height = int(h)
    elif (size >= 16) and data.startswith(b"\211PNG\r\n\032\n"):
        # older PNGs
        imgtype = PNG
        w, h = struct.unpack(">LL", data[8:16])
        width = int(w)
        height = int(h)
    elif (size >= 2) and data.startswith(b"\377\330"):
        # JPEG
        imgtype = JPEG
        input.seek(0)
        input.read(2)
        b = input.read(1)
        try:
            while b and ord(b) != 0xDA:
                while ord(b) != 0xFF:
                    b = input.read(1)
                while ord(b) == 0xFF:
                    b = input.read(1)
                if ord(b) >= 0xC0 and ord(b) <= 0xC3:
                    input.read(3)
                    h, w = struct.unpack(">HH", input.read(4))
                    break
                else:
                    input.read(int(struct.unpack(">H", input.read(2))[0]) - 2)
                b = input.read(1)
            width = int(w)
            height = int(h)
        except struct.error:
            raise UnknownImageFormat("StructError" + msg)
        except ValueError:
            raise UnknownImageFormat("ValueError" + msg)
        except Exception as e:
            raise UnknownImageFormat(e.__class__.__name__ + msg)
    elif (size >= 26) and data.startswith(b"BM"):
        # BMP
        imgtype = "BMP"
        headersize = struct.unpack("<I", data[14:18])[0]
        if headersize == 12:
            w, h = struct.unpack("<HH", data[18:22])
            width = int(w)
            height = int(h)
        elif headersize >= 40:
            w, h = struct.unpack("<ii", data[18:26])
            width = int(w)
            # as h is negative when stored upside down
            height = abs(int(h))
        else:
            raise UnknownImageFormat(
                "Unkown DIB header size:" + str(headersize)
            )
    elif (size >= 8) and data[:4] in (b"II\052\000", b"MM\000\052"):
        # Standard TIFF, big- or little-endian
        # BigTIFF and other different but TIFF-like formats are not
        # supported currently
        imgtype = TIFF
        byteOrder = data[:2]
        boChar = ">" if byteOrder == "MM" else "<"
        # maps TIFF type id to size (in bytes)
        # and python format char for struct
        tiffTypes = {
            1: (1, boChar + "B"),  # BYTE
            2: (1, boChar + "c"),  # ASCII
            3: (2, boChar + "H"),  # SHORT
            4: (4, boChar + "L"),  # LONG
            5: (8, boChar + "LL"),  # RATIONAL
            6: (1, boChar + "b"),  # SBYTE
            7: (1, boChar + "c"),  # UNDEFINED
            8: (2, boChar + "h"),  # SSHORT
            9: (4, boChar + "l"),  # SLONG
            10: (8, boChar + "ll"),  # SRATIONAL
            11: (4, boChar + "f"),  # FLOAT
            12: (8, boChar + "d"),  # DOUBLE
        }
        ifdOffset = struct.unpack(boChar + "L", data[4:8])[0]
        try:
            countSize = 2
            input.seek(ifdOffset)
            ec = input.read(countSize)
            ifdEntryCount = struct.unpack(boChar + "H", ec)[0]
            # 2 bytes: TagId + 2 bytes: type + 4 bytes: count of values + 4
            # bytes: value offset
            ifdEntrySize = 12
            for i in range(ifdEntryCount):
                entryOffset = ifdOffset + countSize + i * ifdEntrySize
                input.seek(entryOffset)
                tag = input.read(2)
                tag = struct.unpack(boChar + "H", tag)[0]
                if tag == 256 or tag == 257:
                    # if type indicates that value fits into 4 bytes, value
                    # offset is not an offset but value itself
                    type = input.read(2)
                    type = struct.unpack(boChar + "H", type)[0]
                    if type not in tiffTypes:
                        raise UnknownImageFormat(
                            "Unkown TIFF field type:" + str(type)
                        )
                    typeSize = tiffTypes[type][0]
                    typeChar = tiffTypes[type][1]
                    input.seek(entryOffset + 8)
                    value = input.read(typeSize)
                    value = int(struct.unpack(typeChar, value)[0])
                    if tag == 256:
                        width = value
                    else:
                        height = value
                if width > -1 and height > -1:
                    break
        except Exception as e:
            raise UnknownImageFormat(str(e))
    elif size >= 2:
        # see http://en.wikipedia.org/wiki/ICO_(file_format)
        imgtype = "ICO"
        input.seek(0)
        reserved = input.read(2)
        if 0 != struct.unpack("<H", reserved)[0]:
            raise UnknownImageFormat(FILE_UNKNOWN)
        format = input.read(2)
        if 1 != struct.unpack("<H", format)[0]:
            raise UnknownImageFormat(FILE_UNKNOWN)
        num = input.read(2)
        num = struct.unpack("<H", num)[0]
        if num > 1:
            msg = "ICO File contains more than one image"
            warnings.warn(msg)

        # http://msdn.microsoft.com/en-us/library/ms997538.aspx
        w = input.read(1)
        h = input.read(1)
        width = ord(w)
        height = ord(h)
    else:
        raise UnknownImageFormat(FILE_UNKNOWN)

    return Image(
        path=file_path,
        type=imgtype,
        file_size=size,
        width=width,
        height=height,
    )
