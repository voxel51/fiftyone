"""
FiftyOne server media handling.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
from dateutil.parser import parse as parsedate
import hashlib
import os
import stat

import aiofiles
import aiohttp
import tornado.web

from fiftyone.core.cache import media_cache

import fiftyone.server.base as fosb

CHUNK_SIZE = 64 * 1024


class MediaHandler(fosb.FileHandler):
    async def get(self, path, include_body=True):
        # Set up our path instance variables.
        self.path = self.parse_url_path(path)
        del path  # make sure we don't refer to path instead of self.path again
        absolute_path = self.get_absolute_path(self.root, self.path)
        self.absolute_path = self.validate_absolute_path(
            self.root, absolute_path
        )
        if self.absolute_path is None:
            return

        self.modified = await self.get_modified_time()
        self.set_headers()

        if self.should_return_304():
            self.set_status(304)
            return

        request_range = None
        range_header = self.request.headers.get("Range")
        if range_header:
            # As per RFC 2616 14.16, if an invalid Range header is specified,
            # the request will be treated as if the header didn't exist.
            request_range = tornado.httputil._parse_request_range(range_header)

        size = await self.get_content_size()
        if request_range:
            start, end = request_range
            if start is not None and start < 0:
                start += size
                if start < 0:
                    start = 0
            if (
                start is not None
                and (start >= size or (end is not None and start >= end))
            ) or end == 0:
                # As per RFC 2616 14.35.1, a range is not satisfiable only: if
                # the first requested byte is equal to or greater than the
                # content, or when a suffix with length 0 is specified.
                # https://tools.ietf.org/html/rfc7233#section-2.1
                # A byte-range-spec is invalid if the last-byte-pos value is present
                # and less than the first-byte-pos.
                self.set_status(416)  # Range Not Satisfiable
                self.set_header("Content-Type", "text/plain")
                self.set_header("Content-Range", "bytes */%s" % (size,))
                return
            if end is not None and end > size:
                # Clients sometimes blindly use a large range to limit their
                # download size; cap the endpoint at the actual file size.
                end = size
            # Note: only return HTTP 206 if less than the entire range has been
            # requested. Not only is this semantically correct, but Chrome
            # refuses to play audio if it gets an HTTP 206 in response to
            # ``Range: bytes=0-``.
            if size != (end or size) - (start or 0):
                self.set_status(206)  # Partial Content
                self.set_header(
                    "Content-Range",
                    tornado.httputil._get_content_range(start, end, size),
                )
        else:
            start = end = None

        if start is not None and end is not None:
            content_length = end - start
        elif end is not None:
            content_length = end
        elif start is not None:
            content_length = size - start
        else:
            content_length = size
        self.set_header("Content-Length", content_length)

        if include_body:
            content = self.get_content(self.absolute_path, start, end)
            if isinstance(content, bytes):
                content = [content]
            async for chunk in content:
                try:
                    self.write(chunk)
                    await self.flush()
                except tornado.iostream.StreamClosedError:
                    return
        else:
            assert self.request.method == "HEAD"

    @classmethod
    def get_absolute_path(cls, root, path):
        return path

    @classmethod
    async def get_content(cls, abspath, start=None, end=None):
        if media_cache.is_local_or_cached(abspath):
            async with aiofiles.open(abspath, "rb") as file:
                if start is not None:
                    file.seek(start)
                if end is not None:
                    remaining = end - (start or 0)
                else:
                    remaining = None
                while True:
                    chunk_size = CHUNK_SIZE
                    if remaining is not None and remaining < chunk_size:
                        chunk_size = remaining
                    chunk = file.read(chunk_size)
                    if chunk:
                        if remaining is not None:
                            remaining -= len(chunk)
                        yield chunk
                    else:
                        if remaining is not None:
                            assert remaining == 0
                        return

        headers = None

        if start is not None and end is not None:
            headers = {"Range": "bytes=%d-%d" % (start, end)}
        url = media_cache.get_url(abspath, method="GET", headers=headers)
        async with aiohttp.ClientSession() as session, session.get(
            url, headers=headers
        ) as response:
            async for data in response.content.iter_chunked(CHUNK_SIZE):
                yield data

    def validate_absolute_path(self, root, absolute_path):
        return absolute_path

    async def get_content_size(self):
        stat_result = await self._stat()
        return stat_result[stat.ST_SIZE]

    async def get_modified_time(self):
        stat_result = await self._stat()
        return datetime.utcfromtimestamp(stat_result[stat.ST_MTIME])

    async def _stat(self):
        if hasattr(self, "_stat_result"):
            return self._stat_result

        abspath = self.absolute_path
        if media_cache.is_local(abspath):
            self._stat_result = os.stat(abspath)
            return self._stat_result

        if media_cache.is_local_or_cached(abspath):
            local_path = media_cache.get_local_path(abspath)
            self._stat_result = os.stat(local_path)
            return self._stat_result

        url = media_cache.get_url(abspath, method="HEAD")
        async with aiohttp.ClientSession() as session, session.head(
            url
        ) as response:
            try:
                headers = response.headers
                self._stat_result = {
                    stat.ST_SIZE: int(headers["Content-Length"]),
                    stat.ST_MTIME: int(
                        parsedate(headers["Last-Modified"]).timestamp()
                    ),
                }
            except:
                raise FileNotFoundError(
                    "Unable to get metadata for file: '%s'" % abspath
                )

        return self._stat_result

    @classmethod
    async def get_content_version(cls, abspath):
        hasher = hashlib.sha512()

        data = await cls.get_content(abspath)
        if isinstance(data, bytes):
            hasher.update(data)
        else:
            async for chunk in data:
                hasher.update(chunk)

        return hasher.hexdigest()

    @classmethod
    async def _get_cached_version(cls, abs_path):
        with cls._lock:
            hashes = cls._static_hashes
            if abs_path not in hashes:
                try:
                    hashes[abs_path] = cls.get_content_version(abs_path)
                except Exception:
                    hashes[abs_path] = None
            hsh = hashes.get(abs_path)
            if hsh:
                return hsh
        return None
