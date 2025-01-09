#!/usr/bin/env python
"""
Installs the ``fiftyone-desktop`` package.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os
import shutil
from setuptools import setup
from wheel.bdist_wheel import bdist_wheel

import os
import shutil


VERSION = "0.35.0"


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


def make_tar(dir_path, tar_path):
    outpath, format = _get_tar_format(tar_path)

    rootdir, basedir = os.path.split(os.path.realpath(dir_path))
    shutil.make_archive(outpath, format, rootdir, basedir)


def _get_tar_format(archive_path):
    basepath, ext = os.path.splitext(archive_path)
    if basepath.endswith(".tar"):
        # Handle .tar.gz and .tar.bz
        basepath, ext2 = os.path.splitext(basepath)
        ext = ext2 + ext

    if ext == ".tar":
        return basepath, "tar"

    if ext in (".tar.gz", ".tgz"):
        return basepath, "gztar"

    if ext in (".tar.bz", ".tbz"):
        return basepath, "bztar"

    raise ValueError("Unsupported archive format '%s'" % archive_path)


class CustomBdistWheel(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # not pure Python
        self.root_is_pure = False

        platform = self.plat_name
        is_platform = lambda os, isa=None: platform.startswith(os) and (
            not isa or platform.endswith(isa)
        )

        if is_platform("linux", "aarch64"):
            self.plat_name = "manylinux2014_aarch64"
        elif is_platform("linux", "x86_64"):
            self.plat_name = "manylinux1_x86_64"
        elif is_platform("mac", "arm64"):
            self.plat_name = "macosx_11_0_arm64"
        elif is_platform("mac", "x86_64"):
            self.plat_name = "macosx_10_10_x86_64"
        elif is_platform("win"):
            self.plat_name = "win_amd64"
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
        if os.environ.get("RELEASE_DIR"):
            release_dir = os.environ["RELEASE_DIR"]
        else:
            release_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "..",
                "..",
                "app",
                "packages",
                "desktop",
                "release",
            )
        bin_dir = os.path.join(
            self.bdist_dir,
            self.data_dir,
            "purelib",
            "fiftyone",
            "desktop",
            "bin",
        )

        if os.environ.get("FIFTYONE_APP_EXE_PATH"):
            apps = [os.environ["FIFTYONE_APP_EXE_PATH"]]
        elif self.plat_name.startswith("manylinux"):
            apps = glob.glob(os.path.join(release_dir, "FiftyOne*.AppImage"))
        elif self.plat_name == "macosx_11_0_arm64":
            apps = glob.glob(
                os.path.join(release_dir, "mac-arm64", "FiftyOne*.app")
            )
        elif self.plat_name.startswith("mac"):
            apps = glob.glob(os.path.join(release_dir, "mac", "FiftyOne*.app"))
        elif self.plat_name.startswith("win"):
            apps = glob.glob(os.path.join(release_dir, "FiftyOne*.exe"))
        else:
            raise ValueError(
                "Unsupported target platform: %r" % self.plat_name
            )
        if not apps:
            raise RuntimeError(
                "Could not find any built Electron apps in %r. "
                "Run 'yarn package-PLATFORM' in the 'electron' folder first."
                % release_dir
            )
        elif len(apps) > 1:
            raise RuntimeError(
                "Found too many Electron apps in %r: %r" % (release_dir, apps)
            )
        app_path = apps[0]

        if not os.path.isdir(bin_dir):
            os.mkdir(bin_dir)
        if os.path.isfile(app_path):
            # use copy2 to maintain executable permission
            ext = os.path.splitext(app_path)[-1]
        elif os.path.isdir(app_path):
            ext = ".app"
        else:
            raise RuntimeError("Unsupported file type: %r" % app_path)

        ext += ".tar.gz"
        make_tar(app_path, os.path.join(bin_dir, "FiftyOne" + ext))


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

with open("README.md", "r") as fh:
    long_description = fh.read()

setup(
    name="fiftyone-desktop",
    version=get_version(),
    description="FiftyOne Desktop",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="Apache",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=["fiftyone.desktop"],
    package_dir={"fiftyone.desktop": "src"},
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
