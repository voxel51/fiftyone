#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os
import shutil
from setuptools import setup, find_packages
from setuptools.command.install import install
from wheel.bdist_wheel import bdist_wheel


class CustomBdistWheel(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # not pure Python
        self.root_is_pure = False
        # rewrite platform name to match what Electron supports
        # https://www.electronjs.org/docs/tutorial/support#supported-platforms
        if self.plat_name.startswith("mac"):
            self.plat_name = "macosx_10_10_x86_64"
        elif self.plat_name.startswith("linux"):
            # we only distribute 64-bit Linux binaries, even though Electron
            # also provides 32-bit binaries
            self.plat_name = "linux_x86_64"
        elif self.plat_name.startswith("win"):
            # we only distribute 64-bit Windows binaries
            self.plat_name = "win_amd64"
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
        release_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "..",
            "electron",
            "release",
        )
        bin_dir = os.path.join(
            self.bdist_dir, self.data_dir, "purelib", "fiftyone", "gui", "bin"
        )

        if self.plat_name.startswith("linux"):
            apps = glob.glob(os.path.join(release_dir, "FiftyOne*.AppImage"))
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
            shutil.copy2(app_path, os.path.join(bin_dir, "FiftyOne" + ext))
        elif os.path.isdir(app_path):
            # Mac app bundle
            shutil.copytree(app_path, os.path.join(bin_dir, "FiftyOne.app"))
        else:
            raise RuntimeError("Unsupported file type: %r" % app_path)


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

setup(
    name="fiftyone_gui",
    version="0.5.5",
    description="FiftyOne App",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="Apache",
    packages=["fiftyone.gui"],
    package_dir={"fiftyone.gui": "src"},
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
    ],
    python_requires=">=3.5",
    cmdclass=cmdclass,
)
