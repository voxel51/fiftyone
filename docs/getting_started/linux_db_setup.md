# Linux MongoDB Setup Guide

FiftyOne relies on a version of MongoDB that works on Ubuntu 18.04 and several
other modern distributions. If this version does not work on your distribution,
there are alternative builds available, or you can use an existing installation
of MongoDB.

## Installing alternative builds with `pip`

Alternative builds are available as pip packages for the distributions listed
below, and can be installed by running the corresponding command. Note that
these packages must be installed _after_ the `fiftyone` package; if you install
`fiftyone` afterwards, you can fix your MongoDB installation by adding
`--force-reinstall` to the commands below.

### Ubuntu 16.04

```
pip install --index https://pypi.voxel51.com fiftyone-db-ubuntu1604
```

### Debian 9

```
pip install --index https://pypi.voxel51.com fiftyone-db-debian9
```

## Installing MongoDB manually

FiftyOne also supports using an existing MongoDB installation (version 3.6 or
newer). This can be installed through many distributions' package managers.
Note that only the `mongod` (server) binary is required, so you may not need
the complete MongoDB package. For example, Debian-based distributions make this
available in the `mongodb-server` package.

If your distribution does not provide a new-enough version of MongoDB, or if
you would like to install a newer version, see
[the MongoDB documentation](https://docs.mongodb.com/manual/administration/install-on-linux/)
for instructions on installing MongoDB on your distribution. Note that you only
need the `mongodb-org-server` package in this case.

To verify the version of your MongoDB installation, run `mongod --version`,
which should produce output that looks like this:

```
db version v4.2.6
git version: 20364840b8f1af16917e4c23c1b5f5efd8b352f8
OpenSSL version: OpenSSL 1.1.1  11 Sep 2018
allocator: tcmalloc
modules: none
build environment:
    distmod: ubuntu1804
    distarch: x86_64
    target_arch: x86_64
```

Verify that the version number after "db version" is at least 3.6.
