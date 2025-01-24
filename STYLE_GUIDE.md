# FiftyOne Style Guide

This document contains our style guides for the primary languages used by
FiftyOne.

Our priority is _consistency_, so that developers can quickly ingest and
understand the entire codebase without being distracted by style
idiosyncrasies.

> When in doubt, follow the existing style in the files you're contributing to.

## Python Style Guide

Our Python style is derived from
[Google Python style](https://google.github.io/styleguide/pyguide.html), with
the exception that we do not use type annotations.

### Pre-commit hooks

All Python code is formatted with [black](https://github.com/python/black) and
[pylint](https://github.com/PyCQA/pylint) via
[pre-commit hooks](CONTRIBUTING.md#developer-guide), which automatically
enforces much of the whitespace-related components of our style.

### Highlights

Here are some highlights of our Python style:

-   Maximum line length is **79 characters**, with the exception of long URLs
    that cannot be split

-   Indent your code with **4 spaces**. That is, **no tabs**!

-   Always strip all trailing whitespace from lines that you edit (you can
    configure your text editor to do this automatically)

-   Follow standard typographic rules for spaces around punctuation

-   Leave two blank lines between top-level definitions, and one blank line
    between class method definitions

-   Imports should always be on separate lines at the top of the file, just
    after the module docstring. Imports should be grouped by type with one
    space between each group, sorted alphabetically within each group, with the
    groups sorted in order of most generic (standard library) to least generic
    (local modules)

-   Names should follow the conventions:

```py
module_name, package_name, ClassName, method_name, ExceptionName,
function_name, GLOBAL_CONSTANT_NAME, global_var_name, instance_var_name,
function_parameter_name, local_var_name
```

-   All private variables, constants, functions, methods, and classes should
    have `_` prepended

-   All non-trivial public module/class methods should have docstrings
    describing their behavior, inputs, outputs, and exceptions (when
    applicable)

-   If a class inherits from no other base classes, explicitly inherit from
    `object`

-   When encountering a pylint error during a commit that cannot be addressed
    for whatever reason, add an inline comment `# pylint: disable=rule` where
    `rule` is the rule in question

-   Use `@todo` to mark todo items in the source code when appropriate

### Imports

Imports should always be on separate lines at the top of the file, immediately
below the module docstring. Imports should be grouped by type with one space
between each group, with the groups sorted in order of most generic to least
generic:

-   Standard library imports (most generic)
-   Third-party package dependencies
-   Voxel51-authored non-FiftyOne package dependencies
-   FiftyOne modules (least generic)

For core FiftyOne imports, we import modules as `fox`, where `x` is the first
letter of the module imported. If necessary, we use `foxy` to disambiguate
between two modules that start with the same letter.

Within each import group, imports should be sorted alphabetically by full
package path, ignoring `from` and `import`.

We also allow direct importing of (a small number of) names into the local
namespace at the developer's discretion.

For example, an import block might look like this:

```py
"""
Module docstring.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import sys

import cv2
import numpy as np

import eta.core.image as etai
import eta.core.video as etav

import fiftyone as fo
from fiftyone.core.document import Document
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fome
import fiftyone.utils.image as foui
import fiftyone.utils.image as fouv
```

### Docstrings

Our docstring style is derived from
[Google Python style](https://google.github.io/styleguide/pyguide.html#38-comments-and-docstrings),
with the exception that we do not use type annotations.

Note that the docstrings of all public methods and classes are automatically
included in the [documentation](docs/README.md) via
[Sphinx](https://www.sphinx-doc.org/en/master) and
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon), so
docstrings should use Sphinx constructs to link to relevant classes, functions,
and docs sections as appropriate:

```py
def example_function(foo, hello="world"):
    """An example docstring that uses Sphinx constructs.

    Docs sections can be referenced via :ref:`custom text here <anchor-link>`.

    Classes can be referenced via
    :class:`fiftyone.core.expressions.ViewExpression` or
    :class:`ViewExpression <fiftyone.core.expressions.ViewExpression>`.

    Functions can be referenced via
    :func:`fiftyone.core.datasets.list_datasets` or
    :func:`list_datasets() <fiftyone.core.datasets.list_datasets>`.

    .. note::

        Directives like notes can be used.

    Examples::

        # Example code is encouraged!

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")
        session = fo.launch_app(dataset)

    Args:
        foo: a required parameter
        hello ("world"): a parameter with a default value

    Returns:
        some cool stuff
    """
    pass
```

Remember to [build the docs locally](docs/README.md) and verify that any
docstrings that you're unsure about are properly rendered in the docs.

#### Module docstrings

All modules should begin with a docstring that includes a short (usually one
line) description and a copyright block formatted exactly as shown below:

```py
"""
Short module description here (generally one sentence max).

A longer section can also be added here as appropriate.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
```

#### Function docstrings

All non-trivial public functions should have docstrings following the pattern
shown below.

Each section can be omitted if there are no inputs, outputs, or no notable
exceptions raised, respectively.

```py
def to_polyline(detection, tolerance=2, filled=True):
    """Returns a :class:`fiftyone.core.labels.Polyline` representation of the
    :class:`fiftyone.core.labels.Detection`.

    If the detection has a mask, the returned polyline will trace the
    boundary of the mask; otherwise, the polyline will trace the bounding
    box itself.

    Args:
        detection: a :class:`fiftyone.core.labels.Detection`
        tolerance (2): a tolerance, in pixels, when generating an
            approximate polyline for the instance mask. Typical values are
            1-3 pixels
        filled (True): whether the polyline should be filled

    Returns:
        a :class:`fiftyone.core.labels.Polyline`

    Raises:
        ValueError: if the detection's bounding box has negative area
    """
    pass
```

#### Class docstrings

All non-trivial public classes should have class docstrings following the
pattern shown below.

Note that the parameters of the `__init__()` method are documented in the class
docstring itself:

```py
class Classification(object):
    """A classification label.

    Args:
        label: the label string
        confidence (None): a confidence in ``[0, 1]`` for the classification
    """

    def __init__(self, label, confidence=None):
        pass
```

### Logging

FiftyOne uses the standard Python `logging` module to log messages using the
conventions below:

```py
import logging

# Use this pattern to retrieve a logger for the current module
logger = logging.getLogger(__name__)

logger.debug(...)
logger.info(...)
logger.warning(...)

# Use native exceptions rather than `logger.error()` or `logger.critical()`
raise Exception(...)
```

You can also use the `warnings` package if you want to issue a warning inside a
loop but want to avoid spamming the user's logs/stdout:

```py
import warnings

for _ in range(100):
    msg = "This warning should only be printed once"
    warnings.warn(msg)
```

### Customizing black

You don't customize [black](https://github.com/python/black), silly! From the
docs:

> Pro-tip: If you’re asking yourself “Do I need to configure anything?” the
> answer is “No”. Black is all about sensible defaults.

With that said, we do maintain a limited configuration in the `[tool.black]`
section of `pyproject.toml`.

### Customizing pylint

To permanently disable a pylint message, add it to the `disable` field in the
`pylintrc` file:

```shell
[MESSAGES CONTROL]
disable=too-few-public-methods,too-many-arguments
```

To disable a pylint message for the rest of the current block (indentation
level) in a module, add the comment:

```py
# pylint: disable=too-many-instance-attributes
```

To disable a pylint message for the current line:

```py
from builtins import *  # pylint disable=wildcard-import
```

To disable pylint errors temporarily in a module:

```py
# pragma pylint: disable=redefined-builtin
# pragma pylint: enable=wildcard-import
from builtins import *
# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=wildcard-import
```

See the [pylint user guide](https://pylint.readthedocs.io/en/latest/) for more
information.

## App Style Guide

[The App](https://github.com/voxel51/fiftyone/tree/develop/app) is a TypeScript
monorepo in which the main package is a React 18 application.

Comprehensive Style guide forthcoming.

### ESLint

We are introducing [ESLint](https://eslint.org/docs/latest/about/) to enforce
linting rules. Since this is a rather late introduction, we're using the
[only-warn](https://www.npmjs.com/package/eslint-plugin-only-warn) plugin to
render all errors as warnings until we gracefully address all warnings in small
chunks, after which this plugin will be removed and rules will be enforced with
higher strictness.

See `app/.eslintrc.js` for our ESLint config, and refer to
[this page](https://eslint.org/docs/latest/user-guide/configuring/) for
configuration options.

### Pre-commit hooks

TypeScript and CSS files in FiftyOne are formatted with
[prettier](https://prettier.io) via
[pre-commit hooks](CONTRIBUTING.md#developer-guide), which automatically
enforces much of the whitespace-related components of our style.

See `.prettierrc.js` for our prettier configuration, and refer to
[this page](https://prettier.io/docs/en/configuration.html) for configuration
options.

## Documentation Style Guide

The [FiftyOne Documentation](https://fiftyone.ai) is written primarily in
reStructuredText (RST) files and rendered via
[Sphinx](https://www.sphinx-doc.org/en/master) and
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon).

Note that the docstrings of all public methods and classes in the Python code
are automatically included in the documentation. See
[this section](#docstrings) for more information about writing Sphinx-friendly
docstrings.

### Pre-commit hooks

RST files in FiftyOne are formatted with [prettier](https://prettier.io) via
[pre-commit hooks](CONTRIBUTING.md#developer-guide), which automatically
enforces much of the whitespace-related components of our style.

See `.prettierrc` for our prettier configuration, and refer to
[this page](https://prettier.io/docs/en/configuration.html) for configuration
options.

### Highlights

Here are some highlights of our RST style:

-   Maximum line length is **79 characters**, with the exception of long URLs
    that cannot be split

-   Leave exactly one blank line before and after all of the following:

    -   Paragraphs
    -   Code blocks
    -   Section and subsection headings

-   One blank line at the end of the file

-   Indent 4 spaces when writing multiline list items, tabs, groups, code
    blocks, etc.

-   Always strip all trailing whitespace from lines that you edit (you can
    configure your text editor to do this automatically)

-   Follow standard typographic rules for spaces around punctuation

-   Add anchor links for any sections that you link to from other pages, so
    that section titles can be changed later if desired:

```
.. _view-stages:

View stages
___________

Dataset views encapsulate a pipeline of logical operations that determine which
samples appear in the view (and perhaps what subset of their contents).
```

-   **Never edit** an anchor link itself once it is created, as this may break
    an external link (e.g., blog post, presentation, etc.)

### Building the docs locally

Always [build the docs locally](docs/README.md) to verify that your edits
render correctly before committing your changes.

## Markdown Style Guide

Markdown files in FiftyOne should be written in
[GitHub-flavored Markdown](https://github.github.com/gfm).

### Pre-commit hooks

Markdown files in FiftyOne are formatted with [prettier](https://prettier.io)
via [pre-commit hooks](CONTRIBUTING.md#developer-guide), which automatically
enforces much of the whitespace-related components of our style.

See `.prettierrc` for our prettier configuration, and refer to
[this page](https://prettier.io/docs/en/configuration.html) for configuration
options.

### Highlights

Here are some highlights of our Markdown style:

-   Maximum line length is **79 characters**, with the exception of long URLs
    that cannot be split

-   All Markdown files start with a title with `# Uppercase Title Words` syntax

-   Section headings use `## Capital then lowercase` syntax

-   Leave exactly one blank line before and after all of the following:

    -   Paragraphs
    -   Code blocks
    -   Section headings `##`
    -   Lower level headings `###` and `####`

-   One blank line at the end of the file

-   Indent 4 spaces when writing multiline list items

-   Always strip all trailing whitespace from lines that you edit (you can
    configure your text editor to do this automatically)

-   Follow standard typographic rules for spaces around punctuation

### Previewing Markdown locally

It is highly recommended that you install the
[grip](https://github.com/joeyespo/grip) package, which lets you render your
Markdown files locally on your machine using GitHub's API to ensure that the
file will render correctly at https://github.com.

You can render a Markdown file with `grip` by running:

```shell
grip -b --user=<github-user> --pass=<api-key> /path/to/markdown/file.md
```

### Customizing prettier

See `.prettierrc` for our prettier configuration, and refer to
[this page](https://prettier.io/docs/en/configuration.html) for configuration
options.
