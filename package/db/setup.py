#!/usr/bin/env python
"""
Installs the ``fiftyone-db`` package.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import os
import pathlib
import platform
import shutil
import tarfile
import traceback
import zipfile

from setuptools import setup
from urllib.request import urlopen
from wheel.bdist_wheel import bdist_wheel

DARWIN = "Darwin"
DARWIN_DOWNLOADS = {
    "arm64": "https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-6.0.2.tgz",
    "x86_64": "https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-5.0.4.tgz",
}

LINUX = "Linux"
LINUX_DOWNLOADS = {
    "amzn": {
        "2": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-amazon2-7.0.2.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-amazon2-7.0.2.tgz",
        },
        "2023": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-amazon2023-7.0.2.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-amazon2023-7.0.2.tgz",
        },
    },
    "centos": {
        "7": {
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel70-5.0.4.tgz",
        },
        "8": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-rhel82-5.0.22.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel80-5.0.4.tgz",
        },
        "9": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-rhel90-7.0.2.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel90-7.0.2.tgz",
        },
    },
    "debian": {
        "9": {
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian92-5.0.22.tgz",
        },
        "10": {
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian10-5.0.22.tgz"
        },
        "11": {
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian11-5.0.22.tgz"
        },
        "12": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-6.0.5.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.5.tgz",
        },
    },
    "fedora": {
        "4": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-rhel90-7.0.2.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel90-7.0.2.tgz",
        },
    },
    "pop": {
        "18": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu1804-5.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-5.0.4.tgz",
        },
        "20": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2004-5.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-5.0.4.tgz",
        },
        "22": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-6.0.5.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.5.tgz",
        },
        "23": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-7.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.4.tgz",
        },
        "24": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-7.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.4.tgz",
        },
    },
    "rhel": {
        "7": {
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel70-5.0.4.tgz",
        },
        "8": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-rhel82-5.0.22.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel80-5.0.4.tgz",
        },
        "9": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-rhel90-7.0.2.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-rhel90-7.0.2.tgz",
        },
    },
    "ubuntu": {
        "18": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu1804-5.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-5.0.4.tgz",
        },
        "20": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2004-5.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-5.0.4.tgz",
        },
        "22": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-6.0.5.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.5.tgz",
        },
        "23": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2204-7.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.4.tgz",
        },
        "24": {
            "aarch64": "https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2404-8.0.4.tgz",
            "x86_64": "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2404-8.0.4.tgz",
        },
    },
}

WINDOWS = "Windows"
WINDOWS_DOWNLOADS = {
    "x86_64": "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-5.0.4.zip",
    "amd64": "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-5.0.4.zip",
}


MACHINE = os.environ.get("FODB_MACHINE", platform.machine())
SYSTEM = os.environ.get("FODB_SYSTEM", platform.system())


def _get_linux_download():
    path = pathlib.Path("/etc/os-release")
    with open(path) as stream:
        reader = csv.reader(stream, delimiter="=")
        # filter empty lines
        d = dict(line for line in reader if line)

    key = d["ID"].lower()
    if key not in LINUX_DOWNLOADS:
        key = d["ID_LIKE"].lower()

    for k, v in LINUX_DOWNLOADS[key].items():
        if d["VERSION_ID"].startswith(k):
            return v[MACHINE]


def _get_download():
    try:
        if SYSTEM == DARWIN:
            return DARWIN_DOWNLOADS[MACHINE]

        if SYSTEM == WINDOWS:
            return WINDOWS_DOWNLOADS[MACHINE.lower()]

        if SYSTEM == LINUX:
            return _get_linux_download()
    except:
        pass


# mongodb binaries to distribute
MONGODB_BINARIES = ["mongod"]


VERSION = "1.2.0"


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
        is_platform = lambda sys, isa=None: sys == SYSTEM and (
            not isa or isa == MACHINE
        )

        if is_platform("Linux", "i686"):
            self.plat_name = "manylinux1_i686"
        elif is_platform("Linux", "aarch64"):
            self.plat_name = "manylinux2014_aarch64"
        elif is_platform("Linux", "x86_64"):
            self.plat_name = "manylinux1_x86_64"
        elif is_platform("Darwin", "arm64"):
            self.plat_name = "macosx_11_0_arm64"
        elif is_platform("Darwin", "x86_64"):
            self.plat_name = "macosx_10_13_x86_64"
        elif is_platform("Windows", "x86_64"):
            self.plat_name = "win_amd64"
        elif is_platform("Windows", "32"):
            self.plat_name = "win32"

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

        mongo_zip_url = _get_download()
        if mongo_zip_url is None:
            return

        mongo_zip_filename = os.path.basename(mongo_zip_url)

        mongo_zip_dest = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            mongo_zip_filename,
        )

        try:
            if not os.path.exists(mongo_zip_dest):
                with urlopen(mongo_zip_url) as conn, open(
                    mongo_zip_dest, "wb"
                ) as dest:
                    shutil.copyfileobj(conn, dest)

        except:
            exc_dest = os.path.join(
                bin_dir,
                "exception.txt",
            )
            with open(exc_dest, "w", encoding="utf-8") as f:
                f.write(traceback.format_exc())
            return

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
                dest_path = os.path.join(bin_dir, filename)
                with mongo_tar.extractfile(tar_entry) as src, open(
                    dest_path, "wb"
                ) as dest:
                    shutil.copyfileobj(src, dest)
                os.chmod(dest_path, tar_entry.mode)


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

with open("README.md", "r") as fh:
    long_description = fh.read()

setup(
    name="fiftyone_db",
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
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.9",
    cmdclass=cmdclass,
)
