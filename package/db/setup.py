#!/usr/bin/env python
"""
Installs the ``fiftyone-db`` package.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import shutil
import tarfile
import zipfile

from setuptools import setup
from wheel.bdist_wheel import bdist_wheel

try:
    # Python 3
    from urllib.request import urlopen
except ImportError:
    # Python 2
    from urllib2 import urlopen


MONGODB_DOWNLOAD_URLS = {
    "linux-aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu1804-5.0.4.tgz",
    "linux-i686": None,
    "linux-x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-5.0.4.tgz",
    "mac-arm64": "https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-6.0.2.tgz",
    "mac-x86_64": "https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-5.0.4.tgz",
    "win-32": None,
    "win-amd64": "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-5.0.4.zip",
    "debian9": {
        "manylinux1_x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian92-5.0.4.tgz",
    },
    "rhel7": {
        "manylinux1_x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel70-5.0.4.tgz",
    },
    "ubuntu2004": {
        "manylinux1_x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-5.0.4.tgz",
    },
    "ubuntu2204": {
        "manylinux1_x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.5.tgz",
    },
}

# mongodb binaries to distribute
MONGODB_BINARIES = ["mongod"]
LINUX_DISTRO = os.environ.get("FIFTYONE_DB_BUILD_LINUX_DISTRO")

VERSION = "0.4.0"


def get_version():
    if "RELEASE_VERSION" in os.environ:
        version = os.environ["RELEASE_VERSION"]
        if not version.startswith(VERSION):
            raise ValueError(
                "Release version does not match version: %s and %s"
                % (version, VERSION)
            )
        return version

    return VERSION


class CustomBdistWheel(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)

        self.root_is_pure = False
        self._plat_name = self.plat_name

        platform = self.plat_name
        is_platform = lambda os, isa=None: platform.startswith(os) and (
            not isa or platform.endswith(isa)
        )

        if is_platform("linux", "i686"):
            self.plat_name = "manylinux1_i686"
        elif is_platform("linux", "aarch64"):
            self.plat_name = "manylinux2014_aarch64"
        elif is_platform("linux", "x86_64"):
            self.plat_name = "manylinux1_x86_64"
        elif is_platform("mac", "arm64"):
            self.plat_name = "macosx_11_0_arm64"
        elif is_platform("mac", "x86_64"):
            self.plat_name = "macosx_10_13_x86_64"
        elif is_platform("win", "amd64"):
            self.plat_name = "win_amd64"
        elif is_platform("win", "32"):
            self.plat_name = "win32"
        else:
            raise ValueError(
                "Unsupported target platform: %r" % self.plat_name
            )

    def get_tag(self):
        impl = "py3"
        abi_tag = "none"
        return impl, abi_tag, self.plat_name

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
            if self._plat_name.startswith(k)
        )

        if mongo_zip_url is None:
            print(
                "Hollow wheel, no binaries available for %s" % self.plat_name
            )
            return

        if LINUX_DISTRO:
            if not self.plat_name.startswith("manylinux"):
                raise ValueError(
                    "Cannot build for distro %r on platform %r"
                    % (LINUX_DISTRO, self.plat_name)
                )

            if LINUX_DISTRO not in MONGODB_DOWNLOAD_URLS:
                raise ValueError("Unrecognized distro: %r" % LINUX_DISTRO)

            mongo_zip_url = MONGODB_DOWNLOAD_URLS[LINUX_DISTRO][self.plat_name]

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
        if mongo_zip_dest.endswith(".zip"):
            # Windows
            mongo_zip = zipfile.ZipFile(mongo_zip_dest)
            for filename in MONGODB_BINARIES:
                filename = filename + ".exe"
                try:
                    zip_entry = next(
                        entry
                        for entry in mongo_zip.filelist
                        if entry.filename.endswith("bin/" + filename)
                    )
                except StopIteration:
                    raise IOError(
                        "Could not find %r in MongoDB archive" % filename
                    )
                print("copying %r" % zip_entry.filename)
                # strip the leading directories (zipfile doesn't have an
                # equivalent of tarfile.extractfile to support this)
                zip_entry.filename = os.path.basename(zip_entry.filename)
                mongo_zip.extract(zip_entry, bin_dir)
        else:
            # assume tar
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

name_suffix = ""
if LINUX_DISTRO:
    name_suffix = "_" + LINUX_DISTRO

with open("README.md", "r") as fh:
    long_description = fh.read()

setup(
    name="fiftyone_db" + name_suffix,
    version=get_version(),
    description="FiftyOne DB",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="Apache",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=["fiftyone.db"],
    package_dir={"fiftyone.db": "src"},
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: Apache Software License",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Scientific/Engineering :: Image Processing",
        "Topic :: Scientific/Engineering :: Image Recognition",
        "Topic :: Scientific/Engineering :: Information Analysis",
        "Topic :: Scientific/Engineering :: Visualization",
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    python_requires=">=3.7",
    cmdclass=cmdclass,
)
