# IR

IR is the system's shared language.

It defines the passive, cloneable values that cross boundaries: sources,
streams, frames, time, manifests, and visualization outputs. IR says what the
data means (not how to load it, decode it, or render it).

This namespace is a dependency leaf. New concepts belong here only when their
semantics make sense across formats and can survive transport between workers,
caches, runtime policy, and UI without carrying behavior with them.
