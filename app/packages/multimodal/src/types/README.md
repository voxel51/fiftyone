# types

This namespace contains narrow ambient declarations that fill gaps in
third-party type definitions. Its existence expresses ownership, not a target
file count, and keeps global declarations visible instead of scattering them
through application domains.

Product models belong in IR and behavioral contracts belong in ports. An
ambient declaration should disappear once upstream types are accurate; this
namespace must never become an alternate domain model.
