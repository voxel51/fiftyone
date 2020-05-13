#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from setuptools import setup, find_packages
from setuptools.command.install import install
from wheel.bdist_wheel import bdist_wheel


class CustomBdistWheel(bdist_wheel):
    def write_wheelfile(self, *args, **kwargs):
        bdist_wheel.write_wheelfile(self, *args, **kwargs)
        bin_dir = os.path.join(
            self.bdist_dir, self.data_dir, "purelib", "fiftyone", "gui", "bin"
        )
        if not os.path.isdir(bin_dir):
            os.mkdir(bin_dir)
        with open(os.path.join(bin_dir, "test"), "w") as f:
            f.write(self.plat_name)

    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # not pure Python
        self.root_is_pure = False

    def get_tag(self):
        impl, abi_tag, plat_name = bdist_wheel.get_tag(self)
        # no dependency on a specific CPython version
        impl = "py2.py3"
        abi_tag = "none"
        return impl, abi_tag, plat_name


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

setup(
    name="fiftyone_gui",
    version="0.1.0",
    description="Project FiftyOne dashboard",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=["fiftyone.gui"],
    package_dir={"fiftyone.gui": "src"},
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    python_requires=">=2.7",
    cmdclass=cmdclass,
)
