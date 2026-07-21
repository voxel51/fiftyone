# types

This is the compatibility shim shelf.

Types fills gaps in third-party declarations so the package can describe the
libraries it actually uses. It should stay small and ambient.

Product models belong in IR; runtime contracts belong in ports. A declaration
here should disappear when the upstream package provides an accurate one. Do
not let this namespace become an alternate domain model (generally, types
should stay close to their domain code.)
