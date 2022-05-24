# Issue Triage

This document is a hands-on manual for doing issue and pull request triage for
[FiftyOne issues on GitHub](https://github.com/voxel51/fiftyone/issues). The
purpose of triage is to speed up issue management and get community members
faster responses.

Issue and pull request triage has three steps:

1. assign one or more process labels (e.g. `needs design` or `help wanted`),
2. mark a priority
3. label one or more relevant areas, (e.g. `app`, `core`, or `server`).

The remainder of the document describes the labels used in each of these steps
and how to apply them.

## Assign appropriate process labels

Assign at least one process label to every issue you triage.

-   `needs design`: This feature is large or tricky enough that we think it
    warrants a design doc and review before someone begins implementation.
-   `help wanted`: We would like community help for this issue.
-   `good first issue`: This would make a good first issue.

## Assign priority

You should assign a priority to each issue you triage.

-   `critical`: This is the highest priority and should be worked on by
    somebody right now. This should typically be reserved for things like
    security bugs, regressions, release blockers.
-   `high-priority`: The issue is worked on by the community currently or will
    be very soon, ideally in time for the next release.
-   `low-priority`: Important over the long term, but may not be staffed or may
    need multiple releases to complete. Also used for things we know are on a
    contributor's roadmap in the next few months.
-   `backlog`: We believe it is useful but don’t see it being prioritized in
    the next few months. Use this for issues that are lower priority than
    `low-priority`.
-   `awaiting-more-evidence`: Lowest priority. Possibly useful, but not yet
    enough support to actually get it done. This is a good place to put issues
    that could be useful but require more evidence to demonstrate broad value.
    Don’t use it as a way to say no. If we think it doesn’t fit in FiftyOne, we
    should just say that and why.

## Label relevant areas

Assign one more labels for relevant areas. As a principle, we aim to have the
minimal set of labels needed to help route issues and PRs to appropriate
contributors.

### Areas

-   App: FiftyOne application changes
-   Build: Build and test infrastructure changes
-   Core: Core `fiftyone` Python library changes
-   Documentation: FiftyOne documentation changes
-   Other
