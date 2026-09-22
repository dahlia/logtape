 -  Fixed a security vulnerability where C0 control characters in a log
    message could inject forged syslog frames.  Since TCP delimits syslog
    messages with a newline, a message containing a newline terminated its own
    frame, and the remainder was received as an independent syslog record with
    an attacker-chosen priority, timestamp, hostname, application name, and
    process ID.  Message text now replaces C0 control characters with
    printable `#NNN` sequences, the same way structured data values do.
    [[GHSA-rjxr-25gw-qw92]]

[GHSA-rjxr-25gw-qw92]: https://github.com/dahlia/logtape/security/advisories/GHSA-rjxr-25gw-qw92
