#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from setuptools import setup, find_packages
from setuptools.command.install import install


class CustomInstall(install):
    def run(self):
        install.run(self)


cmdclass = {
    "install": CustomInstall,
}

setup(
    name="fiftyone-db",
    version="0.1.0",
    description="Project FiftyOne database",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages(),
    include_package_data=True,
    package_data={"fiftyone-db": ["bin/*"]},
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    python_requires=">=2.7",
    cmdclass=cmdclass,
)
