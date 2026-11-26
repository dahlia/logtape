 -  Fixed syslog output for invalid header fields and structured data IDs.
    Invalid header fields use the RFC 5424 nil value, and an invalid ID causes
    structured data to be omitted.  [[GHSA-2qxc-5xj9-7342]]

[GHSA-2qxc-5xj9-7342]: https://github.com/dahlia/logtape/security/advisories/GHSA-2qxc-5xj9-7342
