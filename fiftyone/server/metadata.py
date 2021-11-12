import collections
import logging
import mimetypes
import os
import shutil
import struct

import asyncio
import aiofiles
import aiohttp

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.video as etav

from fiftyone.core.cache import media_cache


logger = logging.getLogger(__name__)


types = collections.OrderedDict()
BMP = types["BMP"] = "BMP"
GIF = types["GIF"] = "GIF"
ICO = types["ICO"] = "ICO"
JPEG = types["JPEG"] = "JPEG"
PNG = types["PNG"] = "PNG"
TIFF = types["TIFF"] = "TIFF"

FFPROBE = shutil.which("ffprobe")


async def get_stream_info(path):
    proc = await asyncio.create_subprocess_exec(
        *[
            FFPROBE,
            "-loglevel",
            "warning",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            "-i",
            path,
        ],
        stdout=asyncio.subprocess.PIPE
    )

    stdout, _ = await proc.communicate()
    info = etas.load_json(stdout.decode("utf8"))
    # Get format info
    format_info = info["format"]

    # Get stream info
    video_streams = [s for s in info["streams"] if s["codec_type"] == "video"]
    num_video_streams = len(video_streams)
    if num_video_streams == 1:
        stream_info = video_streams[0]
    elif num_video_streams == 0:
        logger.warning("No video stream found; defaulting to first stream")
        stream_info = info["streams"][0]
    else:
        logger.warning("Found multiple video streams; using first stream")
        stream_info = video_streams[0]

    info = etav.VideoStreamInfo(
        stream_info, format_info, mime_type=etau.guess_mime_type(path),
    )
    return info


async def read_metadata(filepath):
    video = _is_video(filepath)
    if filepath in media_cache:
        local_path = media_cache.get_local_path(filepath)
        result = await read_local_metadata(local_path, video)
        return result

    url = media_cache.get_url(filepath)
    result = await read_url_metadata(url, video)
    return result


async def read_url_metadata(url, video):
    d = {}
    if video:
        info = await get_stream_info(url)
        d["width"] = info.frame_size[0]
        d["height"] = info.frame_size[1]
        d["frame_rate"] = info.frame_rate
        return d

    async with aiohttp.ClientSession() as session, session.get(
        url
    ) as response:
        width, height = await read_image_dimensions(Reader(response.content))
        d["width"] = width
        d["height"] = height

    return d


async def read_local_metadata(local_path, video):
    d = {}
    if video:
        info = await get_stream_info(local_path)
        d["width"] = info.frame_size[0]
        d["height"] = info.frame_size[1]
        d["frame_rate"] = info.frame_rate
        return d

    async with aiofiles.open(local_path, "rb") as input:
        width, height = await read_image_dimensions(input)
        d["width"] = width
        d["height"] = height

    return d


def _is_video(filepath):
    mime_type = mimetypes.guess_type(filepath)[0]
    return mime_type.startswith("video/")


class Reader(object):
    def __init__(self, content):
        self._data = b""
        self._content = content

    async def read(self, bytes):
        data = await self._content.read(bytes)
        self._data += data
        return data

    async def seek(self, bytes):
        delta = bytes - len(self._data)
        if delta < 0:
            data = self._data[delta:]
            self._data = data[:delta]
            self._content.unread_data(data)
        else:
            self._data += await self._content.read(delta)


async def read_image_dimensions(input):
    height = -1
    width = -1
    data = await input.read(26)
    size = len(data)

    if (size >= 10) and data[:6] in (b"GIF87a", b"GIF89a"):
        # GIFs
        w, h = struct.unpack("<HH", data[6:10])
        width = int(w)
        height = int(h)
    elif (
        (size >= 24)
        and data.startswith(b"\211PNG\r\n\032\n")
        and (data[12:16] == b"IHDR")
    ):
        # PNGs
        w, h = struct.unpack(">LL", data[16:24])
        width = int(w)
        height = int(h)
    elif (size >= 16) and data.startswith(b"\211PNG\r\n\032\n"):
        # older PNGs
        w, h = struct.unpack(">LL", data[8:16])
        width = int(w)
        height = int(h)
    elif (size >= 2) and data.startswith(b"\377\330"):
        # JPEG
        it = iter(data[3])
        b = next(it)

        while b and ord(b) != 0xDA:
            while ord(b) != 0xFF:
                b = next(it)
            while ord(b) == 0xFF:
                b = next(it)
            if ord(b) >= 0xC0 and ord(b) <= 0xC3:
                await input.read(3)
                tmp = await input.read(4)
                h, w = struct.unpack(">HH", tmp)
                break
            else:
                tmp = await input.read(2)
                await input.read(int(struct.unpack(">H", tmp)[0]) - 2)
            b = await input.read(1)
        width = int(w)
        height = int(h)

    elif (size >= 26) and data.startswith(b"BM"):
        # BMP
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
            raise ("Unkown DIB header size:" + str(headersize))
    elif (size >= 8) and data[:4] in (b"II\052\000", b"MM\000\052"):
        # Standard TIFF, big- or little-endian
        # BigTIFF and other different but TIFF-like formats are not
        # supported currently
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

        countSize = 2
        await input.seek(ifdOffset)
        ec = await input.read(countSize)
        ifdEntryCount = struct.unpack(boChar + "H", ec)[0]
        # 2 bytes: TagId + 2 bytes: type + 4 bytes: count of values + 4
        # bytes: value offset
        ifdEntrySize = 12
        for i in range(ifdEntryCount):
            entryOffset = ifdOffset + countSize + i * ifdEntrySize
            await input.seek(entryOffset)
            tag = await input.read(2)
            tag = struct.unpack(boChar + "H", tag)[0]
            if tag == 256 or tag == 257:
                # if type indicates that value fits into 4 bytes, value
                # offset is not an offset but value itself
                type = await input.read(2)
                type = struct.unpack(boChar + "H", type)[0]
                if type not in tiffTypes:
                    raise MetadataException(MSG)
                typeSize = tiffTypes[type][0]
                typeChar = tiffTypes[type][1]
                await input.seek(entryOffset + 8)
                value = await input.read(typeSize)
                value = int(struct.unpack(typeChar, value)[0])
                if tag == 256:
                    width = value
                else:
                    height = value
            if width > -1 and height > -1:
                break

    elif size >= 2:
        await input.seek(0)
        reserved = await input.read(2)
        if 0 != struct.unpack("<H", reserved)[0]:
            raise MetadataException(MSG)
        format = input.read(2)
        if 1 != struct.unpack("<H", format)[0]:
            raise MetadataException(MSG)
        num = await input.read(2)
        num = struct.unpack("<H", num)[0]

        # http://msdn.microsoft.com/en-us/library/ms997538.aspx
        w = await input.read(1)
        h = await input.read(1)
        width = ord(w)
        height = ord(h)

    return [width, height]


MSG = "unable to read metadata"


class MetadataException(Exception):
    pass
