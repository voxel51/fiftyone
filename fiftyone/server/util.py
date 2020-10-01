"""
FiftyOne fast image metadata loading.

Taken from https://github.com/scardine/image_size/blob/master/get_image_size.py

TODO (BEN): clean up, document, and fit into fiftyone.core

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import collections
import json
import mimetypes
import os
import io
import struct

import eta.core.video as etav
import PIL.Image


FILE_UNKNOWN = "Sorry, don't know how to get size for this file."


class UnknownFileFormat(Exception):
    pass


class UnknownImageFormat(UnknownFileFormat):
    pass


def get_file_dimensions(file_path):
    """
    Calculates the dimensions of the specified file.

    Args:
        file_path (str): path to the file

    Returns:
        tuple: (width, height) as integers
    """
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        raise UnknownFileFormat(
            "Cannot identify mime type from %r" % file_path
        )
    category = mime_type.split("/")[0]
    if category == "image":
        return get_image_size(file_path)
    elif category == "video":
        return etav.get_frame_size(file_path)
    raise UnknownFileFormat("Unhandled mime type: %r" % mime_type)


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
        img = get_image_metadata(file_path)
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
        img = get_image_metadata_from_bytesio(input, size)
        return (img.width, img.height)
    except UnknownImageFormat:
        return _get_image_size_pil(input)


def _get_image_size_pil(file):
    try:
        with PIL.Image.open(file) as image:
            return image.size
    except IOError as e:
        raise UnknownImageFormat(e)


def get_image_metadata(file_path):
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
        return get_image_metadata_from_bytesio(input, size, file_path)


def get_image_metadata_from_bytesio(input, size, file_path=None):
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
            import warnings

            warnings.warn("ICO File contains more than one image")
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
