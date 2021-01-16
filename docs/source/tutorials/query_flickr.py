"""
Simple utility to download images from Flickr based on a text query.

Requires a user-specified API key, which can be obtained for free at
https://www.flickr.com/services/apps/create.

Copyright 2017-2021, Voxel51, Inc.
voxel51.com
"""
import argparse
from itertools import takewhile
import os

import flickrapi

import eta.core.storage as etas


def query_flickr(
    key, secret, query, number=50, path="data", query_in_path=True
):
    # Flickr api access key
    flickr = flickrapi.FlickrAPI(key, secret, cache=True)

    # could also query by tags and tag_mode='all'
    photos = flickr.walk(
        text=query, extras="url_c", per_page=50, sort="relevance"
    )

    urls = []
    for photo in takewhile(lambda _: len(urls) < number, photos):
        url = photo.get("url_c")
        if url is not None:
            urls.append(url)

    if query_in_path:
        basedir = os.path.join(path, query)
    else:
        basedir = path

    print(
        "Downloading %d images matching query '%s' to '%s'"
        % (len(urls), query, basedir)
    )
    client = etas.HTTPStorageClient()
    for url in urls:
        outpath = os.path.join(basedir, client.get_filename(url))
        client.download(url, outpath)
        print("Downloading image to '%s'" % outpath)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(add_help=True)

    parser.add_argument("key", type=str, help="Flickr API key")
    parser.add_argument("secret", type=str, help="Secret to Flickr API key")
    parser.add_argument("query", type=str, help="Query string to use")
    parser.add_argument(
        "-n",
        "--number",
        type=int,
        default=50,
        help="number of images to download (default: 50)",
    )
    parser.add_argument(
        "-p",
        "--path",
        type=str,
        default="data",
        help="path to download the images (created if needed)",
    )
    parser.add_argument(
        "--query-in-path", "-i", dest="query_in_path", action="store_true"
    )
    parser.add_argument(
        "--no-query-in-path", dest="query_in_path", action="store_false"
    )
    parser.set_defaults(query_in_path=True)

    args = parser.parse_args()

    query_flickr(
        key=args.key,
        secret=args.secret,
        query=args.query,
        number=args.number,
        path=args.path,
        query_in_path=args.query_in_path,
    )
