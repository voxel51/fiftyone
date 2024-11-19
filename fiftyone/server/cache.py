"""
FiftyOne Server cache utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from cachetools import cached, TLRUCache
from datetime import datetime, timedelta
import logging
import typing as t
import urllib.parse as urlparse


R = t.TypeVar("R")


def create_tlru_cache(
    callable: t.Callable[..., R], cache: TLRUCache
) -> t.Callable[..., R]:
    """
    Create a cached callable using a :class:`cachetools.TLRUCache`

    Args:
        callable: a callable
        cache: a :class:`cachetools.TLRUCache`

    Returns:
        a cached callable
    """
    return cached(cache=cache)(callable)


def extract_ttu_from_url(
    url: str,
    now: datetime,
    default_sec: int,
) -> datetime:
    """
    Extract the expiration time from a URL.

    Args:
        url: a signed URL
        now: current time
        default_sec: default expiration in seconds if now URL expiration is
            found

    Returns:
        an expiration datetime
    """
    date_fmt = "%Y%m%dT%H%M%SZ"

    start_date = now
    expires_in = default_sec
    expires_at = None
    try:
        parsed_url = urlparse.urlparse(url)
        query_params = urlparse.parse_qs(parsed_url.query)
        for key, value in query_params.items():
            if "expires" in key.lower():
                # AWS and GCP URIs have an 'X-<svc>-Expires' parameter
                # representing the expiration time in seconds
                expires_in = int(value[0])
            elif "date" in key.lower():
                # AWS and GCP URIs have an 'X-<svc>-Date' parameter
                # representing the start time in ISO-8601 format
                start_date = datetime.strptime(value[0], date_fmt)
            elif "se" == key.lower():
                # Azure URIs have a 'se' (signedExpiry) parameter representing
                # the expiration date in ISO-8601 format
                expires_at = datetime.strptime(value[0], date_fmt)
                break
    except Exception as e:
        # If we fail to parse the expiration time, just fall back to the
        # default
        logging.error(f"Error expiration time from URL={url}. Error={e}")
        ...
    if not expires_at:
        expires_at = start_date + timedelta(seconds=expires_in)
    # Return the expiration time
    return expires_at
