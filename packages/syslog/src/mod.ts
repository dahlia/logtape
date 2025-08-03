/**
 * Syslog sink for LogTape.
 *
 * This module provides a syslog sink that sends log messages to a syslog server
 * following the RFC 5424 specification.
 *
 * @module
 */

export type {
  SyslogFacility,
  SyslogProtocol,
  SyslogSinkOptions,
} from "./syslog.ts";
export { getSyslogSink } from "./syslog.ts";
