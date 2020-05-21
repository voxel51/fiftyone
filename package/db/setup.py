#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import shutil
import tarfile

from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel

try:
    # Python 3
    from urllib.request import urlopen
except ImportError:
    # Python 2
    from urllib2 import urlopen


MONGODB_DOWNLOAD_URLS = {
    "linux": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-4.2.6.tgz",
    "mac": "https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-4.2.6.tgz",
}
# mongodb binaries to distribute
MONGODB_BINARIES = ["mongod"]


class CustomBdistWheel(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # not pure Python
        self.root_is_pure = False
        # rewrite platform name to match what mongodb supports
        if self.plat_name.startswith("mac"):
            # mongodb 4.2.6 supports macOS 10.12 or later
            # https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/#platform-support
            # also, we only distribute 64-bit binaries
            self.plat_name = "macosx_10_12_x86_64"
        elif self.plat_name.startswith("linux"):
            # we only distribute 64-bit binaries
            self.plat_name = "linux_x86_64"
        else:
            raise ValueError(
                "Unsupported target platform: %r" % self.plat_name
            )

    def get_tag(self):
        impl, abi_tag, plat_name = bdist_wheel.get_tag(self)
        # no dependency on a specific CPython version
        impl = "py2.py3"
        abi_tag = "none"
        return impl, abi_tag, plat_name

    def write_wheelfile(self, *args, **kwargs):
        bdist_wheel.write_wheelfile(self, *args, **kwargs)
        bin_dir = os.path.join(
            self.bdist_dir, self.data_dir, "purelib", "fiftyone", "db", "bin"
        )
        if not os.path.isdir(bin_dir):
            os.mkdir(bin_dir)
        mongo_zip_url = next(
            v
            for k, v in MONGODB_DOWNLOAD_URLS.items()
            if self.plat_name.startswith(k)
        )
        mongo_zip_filename = os.path.basename(mongo_zip_url)
        mongo_zip_dest = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "cache",
            mongo_zip_filename,
        )
        if not os.path.exists(mongo_zip_dest):
            print("downloading MongoDB from %s" % mongo_zip_url)
            with urlopen(mongo_zip_url) as conn, open(
                mongo_zip_dest, "wb"
            ) as dest:
                shutil.copyfileobj(conn, dest)
        print("using MongoDB from %s" % mongo_zip_dest)
        mongo_tar = tarfile.open(mongo_zip_dest)
        for filename in MONGODB_BINARIES:
            try:
                tar_entry_name = next(
                    name
                    for name in mongo_tar.getnames()
                    if name.endswith("bin/" + filename)
                )
            except StopIteration:
                raise IOError(
                    "Could not find %r in MongoDB archive" % filename
                )
            tar_entry = mongo_tar.getmember(tar_entry_name)
            print("copying %r" % tar_entry_name)
            dest_path = os.path.join(bin_dir, filename)
            with mongo_tar.extractfile(tar_entry) as src, open(
                dest_path, "wb"
            ) as dest:
                shutil.copyfileobj(src, dest)
            os.chmod(dest_path, tar_entry.mode)


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

setup(
    name="fiftyone_db",
    version="0.1.0",
    description="Project FiftyOne database",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=["fiftyone.db"],
    package_dir={"fiftyone.db": "src"},
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    python_requires=">=2.7",
    cmdclass=cmdclass,
)
