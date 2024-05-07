<!-- deno-fmt-ignore-file -->

LogTape changelog
=================

Version 0.1.2
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.1.1
-------------

Released on April 21, 2024.

 -  Fixed a bug where the configured sinks and filters were reset after
    some inactivity.  This was caused by garbage collection of the
    `Logger` instances.  The `Logger` instances are now kept alive by
    an internal set of strong references until explicitly `reset()` is
    called.


Version 0.1.0
-------------

Initial release.  Released on April 19, 2024.
