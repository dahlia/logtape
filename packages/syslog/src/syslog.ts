import type { LogLevel, LogRecord, Sink } from "@logtape/logtape";
import { createSocket } from "node:dgram";
import { Socket } from "node:net";
import { hostname } from "node:os";
import process from "node:process";
import * as tls from "node:tls";

/**
 * Syslog protocol type.
 * @since 0.12.0
 */
export type SyslogProtocol = "udp" | "tcp";

/**
 * Syslog facility codes as defined in RFC 5424.
 * @since 0.12.0
 */
export type SyslogFacility =
  | "kernel" // 0  - kernel messages
  | "user" // 1  - user-level messages
  | "mail" // 2  - mail system
  | "daemon" // 3  - system daemons
  | "security" // 4  - security/authorization messages
  | "syslog" // 5  - messages generated internally by syslogd
  | "lpr" // 6  - line printer subsystem
  | "news" // 7  - network news subsystem
  | "uucp" // 8  - UUCP subsystem
  | "cron" // 9  - clock daemon
  | "authpriv" // 10 - security/authorization messages
  | "ftp" // 11 - FTP daemon
  | "ntp" // 12 - NTP subsystem
  | "logaudit" // 13 - log audit
  | "logalert" // 14 - log alert
  | "clock" // 15 - clock daemon
  | "local0" // 16 - local use 0
  | "local1" // 17 - local use 1
  | "local2" // 18 - local use 2
  | "local3" // 19 - local use 3
  | "local4" // 20 - local use 4
  | "local5" // 21 - local use 5
  | "local6" // 22 - local use 6
  | "local7"; // 23 - local use 7

/**
 * Syslog facility code mapping.
 * @since 0.12.0
 */
const FACILITY_CODES: Record<SyslogFacility, number> = {
  kernel: 0,
  user: 1,
  mail: 2,
  daemon: 3,
  security: 4,
  syslog: 5,
  lpr: 6,
  news: 7,
  uucp: 8,
  cron: 9,
  authpriv: 10,
  ftp: 11,
  ntp: 12,
  logaudit: 13,
  logalert: 14,
  clock: 15,
  local0: 16,
  local1: 17,
  local2: 18,
  local3: 19,
  local4: 20,
  local5: 21,
  local6: 22,
  local7: 23,
};

/**
 * Syslog severity levels as defined in RFC 5424.
 * @since 0.12.0
 */
const SEVERITY_LEVELS: Record<LogLevel, number> = {
  fatal: 0, // Emergency: system is unusable
  error: 3, // Error: error conditions
  warning: 4, // Warning: warning conditions
  info: 6, // Informational: informational messages
  debug: 7, // Debug: debug-level messages
  trace: 7, // Debug: debug-level messages (same as debug)
};

/**
 * TLS options for secure TCP connections.
 * @since 1.3.0
 */
export interface SyslogTlsOptions {
  /**
   * Whether to reject connections with invalid certificates.
   * Setting this to `false` disables certificate validation, which makes
   * the connection vulnerable to man-in-the-middle attacks.
   * @default `true`
   */
  readonly rejectUnauthorized?: boolean;

  /**
   * Custom CA certificates to trust.  If not provided, the default system
   * CA certificates are used.
   */
  readonly ca?: string | readonly string[];
}

/**
 * Options for the syslog sink.
 * @since 0.12.0
 */
export interface SyslogSinkOptions {
  /**
   * The hostname or IP address of the syslog server.
   * @default "localhost"
   */
  readonly hostname?: string;

  /**
   * The port number of the syslog server.
   * @default 514
   */
  readonly port?: number;

  /**
   * The protocol to use for sending syslog messages.
   * @default "udp"
   */
  readonly protocol?: SyslogProtocol;

  /**
   * Whether to use TLS for TCP connections.
   * This option is ignored for UDP connections.
   * @default `false`
   * @since 1.3.0
   */
  readonly secure?: boolean;

  /**
   * TLS options for secure TCP connections.
   * This option is only used when `secure` is `true` and `protocol` is `"tcp"`.
   * @since 1.3.0
   */
  readonly tlsOptions?: SyslogTlsOptions;

  /**
   * The syslog facility to use for all messages.
   * @default "local0"
   */
  readonly facility?: SyslogFacility;

  /**
   * The application name to include in syslog messages.
   * @default "logtape"
   */
  readonly appName?: string;

  /**
   * The hostname to include in syslog messages.
   * If not provided, the system hostname will be used.
   */
  readonly syslogHostname?: string;

  /**
   * The process ID to include in syslog messages.
   * If not provided, the current process ID will be used.
   */
  readonly processId?: string;

  /**
   * Connection timeout in milliseconds.
   * @default 5000
   */
  readonly timeout?: number;

  /**
   * Whether to include structured data in syslog messages.
   * @default `false`
   */
  readonly includeStructuredData?: boolean;

  /**
   * The structured data ID to use for log properties.
   * Should follow the format "name@private-enterprise-number".
   * @default "logtape@32473"
   */
  readonly structuredDataId?: string;
}

/**
 * Calculates the priority value for a syslog message.
 * Priority = Facility * 8 + Severity
 * @since 0.12.0
 */
function calculatePriority(facility: SyslogFacility, severity: number): number {
  const facilityCode = FACILITY_CODES[facility];
  return facilityCode * 8 + severity;
}

/**
 * Formats a timestamp (number) as RFC 3339 timestamp for syslog.
 * @since 0.12.0
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Escapes special characters in structured data values.
 * @since 0.12.0
 */
function escapeStructuredDataValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/]/g, "\\]");
}

/**
 * Formats structured data from log record properties.
 * @since 0.12.0
 */
function formatStructuredData(
  record: LogRecord,
  structuredDataId: string,
): string {
  if (!record.properties || Object.keys(record.properties).length === 0) {
    return "-";
  }

  const elements: string[] = [];
  for (const [key, value] of Object.entries(record.properties)) {
    const escapedValue = escapeStructuredDataValue(String(value));
    elements.push(`${key}="${escapedValue}"`);
  }

  return `[${structuredDataId} ${elements.join(" ")}]`;
}

/**
 * Formats a log record as RFC 5424 syslog message.
 * @since 0.12.0
 */
function formatSyslogMessage(
  record: LogRecord,
  options: Required<
    Pick<
      SyslogSinkOptions,
      | "facility"
      | "appName"
      | "syslogHostname"
      | "processId"
      | "includeStructuredData"
      | "structuredDataId"
    >
  >,
): string {
  const severity = SEVERITY_LEVELS[record.level];
  const priority = calculatePriority(options.facility, severity);
  const timestamp = formatTimestamp(record.timestamp);
  const hostname = options.syslogHostname || "-";
  const appName = options.appName || "-";
  const processId = options.processId || "-";
  const msgId = "-"; // Could be enhanced to include message ID

  let structuredData = "-";
  if (options.includeStructuredData) {
    structuredData = formatStructuredData(record, options.structuredDataId);
  }

  // Format the message text
  let message = "";
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      message += record.message[i];
    } else {
      message += JSON.stringify(record.message[i]);
    }
  }

  // RFC 5424 format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
  return `<${priority}>1 ${timestamp} ${hostname} ${appName} ${processId} ${msgId} ${structuredData} ${message}`;
}

/**
 * Gets the system hostname.
 * @since 0.12.0
 */
function getSystemHostname(): string {
  try {
    // Try Deno first
    if (typeof Deno !== "undefined" && Deno.hostname) {
      return Deno.hostname();
    }

    // Try Node.js os.hostname()
    return hostname();
  } catch {
    // Fallback to environment variable or localhost
    return process.env.HOSTNAME || "localhost";
  }
}

/**
 * Gets the current process ID.
 * @since 0.12.0
 */
function getProcessId(): string {
  try {
    // Try Deno first
    if (typeof Deno !== "undefined" && Deno.pid) {
      return Deno.pid.toString();
    }

    // Try Node.js
    return process.pid.toString();
  } catch {
    return "-";
  }
}

/**
 * Base interface for syslog connections.
 * @since 0.12.0
 */
export interface SyslogConnection {
  connect(): void | Promise<void>;
  send(message: string): Promise<void>;
  close(): void;
}

/**
 * Deno UDP syslog connection implementation.
 * @since 0.12.0
 */
export class DenoUdpSyslogConnection implements SyslogConnection {
  private encoder = new TextEncoder();

  constructor(
    private hostname: string,
    private port: number,
    private timeout: number,
  ) {}

  connect(): void {
    // For UDP, we don't need to establish a persistent connection
  }

  send(message: string): Promise<void> {
    const data = this.encoder.encode(message);

    try {
      // Deno doesn't have native UDP support, use Node.js APIs
      const socket = createSocket("udp4");

      if (this.timeout > 0) {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.close();
            reject(new Error("UDP send timeout"));
          }, this.timeout);

          socket.send(data, this.port, this.hostname, (error) => {
            clearTimeout(timeout);
            socket.close();
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } else {
        // No timeout
        return new Promise<void>((resolve, reject) => {
          socket.send(data, this.port, this.hostname, (error) => {
            socket.close();
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      throw new Error(`Failed to send syslog message: ${error}`);
    }
  }

  close(): void {
    // UDP connections don't need explicit closing
  }
}

/**
 * Node.js UDP syslog connection implementation.
 * @since 0.12.0
 */
export class NodeUdpSyslogConnection implements SyslogConnection {
  private encoder = new TextEncoder();

  constructor(
    private hostname: string,
    private port: number,
    private timeout: number,
  ) {}

  connect(): void {
    // For UDP, we don't need to establish a persistent connection
  }

  send(message: string): Promise<void> {
    const data = this.encoder.encode(message);

    try {
      const socket = createSocket("udp4");

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("UDP send timeout"));
        }, this.timeout);

        socket.send(data, this.port, this.hostname, (error) => {
          clearTimeout(timeout);
          socket.close();
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to send syslog message: ${error}`);
    }
  }

  close(): void {
    // UDP connections don't need explicit closing
  }
}

/**
 * Deno TCP syslog connection implementation.
 * @since 0.12.0
 */
export class DenoTcpSyslogConnection implements SyslogConnection {
  private connection?: Deno.TcpConn | Deno.TlsConn;
  private encoder = new TextEncoder();

  constructor(
    private hostname: string,
    private port: number,
    private timeout: number,
    private secure: boolean,
    private tlsOptions?: SyslogTlsOptions,
  ) {}

  async connect(): Promise<void> {
    try {
      const connectOptions: Deno.ConnectOptions = {
        hostname: this.hostname,
        port: this.port,
        transport: "tcp",
      };

      if (this.secure) {
        const tlsConnectOptions: Deno.ConnectTlsOptions = {
          hostname: this.hostname,
          port: this.port,
          caCerts: this.tlsOptions?.ca
            ? (Array.isArray(this.tlsOptions.ca)
              ? [...this.tlsOptions.ca]
              : [this.tlsOptions.ca])
            : undefined,
        };
        const connectPromise = Deno.connectTls(tlsConnectOptions);
        if (this.timeout > 0) {
          let timeoutId: number;
          let timedOut = false;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              reject(new Error("TCP connection timeout"));
            }, this.timeout);
          });

          try {
            this.connection = await Promise.race([
              connectPromise,
              timeoutPromise,
            ]);
          } catch (error) {
            // If timed out, clean up the connection when it eventually completes
            if (timedOut) {
              connectPromise
                .then((conn) => {
                  try {
                    conn.close();
                  } catch {
                    // Ignore close errors
                  }
                })
                .catch(() => {
                  // Ignore connection errors
                });
            }
            throw error;
          } finally {
            clearTimeout(timeoutId!);
          }
        } else {
          this.connection = await connectPromise;
        }
      } else { // Insecure TCP connection
        if (this.timeout > 0) {
          // Use AbortController for proper timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, this.timeout);

          try {
            this.connection = await Deno.connect({
              ...connectOptions,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
          } catch (error) {
            clearTimeout(timeoutId);
            if (controller.signal.aborted) {
              throw new Error("TCP connection timeout");
            }
            throw error;
          }
        } else {
          this.connection = await Deno.connect(connectOptions);
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect to syslog server: ${error}`);
    }
  }

  async send(message: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Connection not established");
    }

    const data = this.encoder.encode(message + "\n");

    try {
      if (this.timeout > 0) {
        // Implement timeout for send using Promise.race
        const writePromise = this.connection.write(data);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("TCP send timeout"));
          }, this.timeout);
        });

        await Promise.race([writePromise, timeoutPromise]);
      } else {
        // No timeout
        await this.connection.write(data);
      }
    } catch (error) {
      throw new Error(`Failed to send syslog message: ${error}`);
    }
  }

  close(): void {
    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        // Ignore errors during close
      }
      this.connection = undefined;
    }
  }
}

/**
 * Node.js TCP syslog connection implementation.
 * @since 0.12.0
 */
export class NodeTcpSyslogConnection implements SyslogConnection {
  private connection?: Socket | tls.TLSSocket;
  private encoder = new TextEncoder();

  constructor(
    private hostname: string,
    private port: number,
    private timeout: number,
    private secure: boolean,
    private tlsOptions?: SyslogTlsOptions,
  ) {}

  connect(): Promise<void> {
    try {
      return new Promise<void>((resolve, reject) => {
        const connectionOptions: tls.ConnectionOptions = {
          port: this.port,
          host: this.hostname,
          timeout: this.timeout,
          rejectUnauthorized: this.tlsOptions?.rejectUnauthorized ?? true,
          ca: this.tlsOptions?.ca
            ? (Array.isArray(this.tlsOptions.ca)
              ? [...this.tlsOptions.ca]
              : [this.tlsOptions.ca])
            : undefined,
        };

        const socket: Socket | tls.TLSSocket = this.secure
          ? tls.connect(connectionOptions)
          : new Socket();

        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error("TCP connection timeout"));
        }, this.timeout);

        socket.on("connect", () => {
          clearTimeout(timeout);
          this.connection = socket;
          resolve();
        });

        socket.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        // For non-TLS sockets, explicitly call connect
        if (!this.secure) {
          (socket as Socket).connect(this.port, this.hostname);
        }
      });
    } catch (error) {
      throw new Error(`Failed to connect to syslog server: ${error}`);
    }
  }

  send(message: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Connection not established");
    }

    const data = this.encoder.encode(message + "\n");

    try {
      return new Promise<void>((resolve, reject) => {
        this.connection!.write(data, (error?: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to send syslog message: ${error}`);
    }
  }

  close(): void {
    if (this.connection) {
      try {
        this.connection.end();
      } catch {
        // Ignore errors during close
      }
      this.connection = undefined;
    }
  }
}

/**
 * Creates a syslog sink that sends log messages to a syslog server using the
 * RFC 5424 syslog protocol format.
 *
 * This sink supports both UDP and TCP protocols for reliable log transmission
 * to centralized logging systems. It automatically formats log records according
 * to RFC 5424 specification, including structured data support for log properties.
 *
 * ## Features
 *
 * - **RFC 5424 Compliance**: Full implementation of the RFC 5424 syslog protocol
 * - **Cross-Runtime Support**: Works with Deno, Node.js, Bun, and browsers
 * - **Multiple Protocols**: Supports both UDP (fire-and-forget) and TCP (reliable) delivery
 * - **Structured Data**: Automatically includes log record properties as RFC 5424 structured data
 * - **Facility Support**: All standard syslog facilities (kern, user, mail, daemon, local0-7, etc.)
 * - **Automatic Escaping**: Proper escaping of special characters in structured data values
 * - **Connection Management**: Automatic connection handling with configurable timeouts
 *
 * ## Protocol Differences
 *
 * - **UDP**: Fast, connectionless delivery suitable for high-throughput logging.
 *   Messages may be lost during network issues but has minimal performance impact.
 * - **TCP**: Reliable, connection-based delivery that ensures message delivery.
 *   Higher overhead but guarantees that log messages reach the server.
 *
 * @param options Configuration options for the syslog sink
 * @returns A sink function that sends log records to the syslog server, implementing AsyncDisposable for proper cleanup
 *
 * @example Basic usage with default options
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getSyslogSink } from "@logtape/syslog";
 *
 * await configure({
 *   sinks: {
 *     syslog: getSyslogSink(),  // Sends to localhost:514 via UDP
 *   },
 *   loggers: [
 *     { category: [], sinks: ["syslog"], lowestLevel: "info" },
 *   ],
 * });
 * ```
 *
 * @example Custom syslog server configuration
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getSyslogSink } from "@logtape/syslog";
 *
 * await configure({
 *   sinks: {
 *     syslog: getSyslogSink({
 *       hostname: "log-server.example.com",
 *       port: 1514,
 *       protocol: "tcp",
 *       facility: "mail",
 *       appName: "my-application",
 *       timeout: 10000,
 *     }),
 *   },
 *   loggers: [
 *     { category: [], sinks: ["syslog"], lowestLevel: "debug" },
 *   ],
 * });
 * ```
 *
 * @example Using structured data for log properties
 * ```typescript
 * import { configure, getLogger } from "@logtape/logtape";
 * import { getSyslogSink } from "@logtape/syslog";
 *
 * await configure({
 *   sinks: {
 *     syslog: getSyslogSink({
 *       includeStructuredData: true,
 *       structuredDataId: "myapp@12345",
 *     }),
 *   },
 *   loggers: [
 *     { category: [], sinks: ["syslog"], lowestLevel: "info" },
 *   ],
 * });
 *
 * const logger = getLogger();
 * // This will include userId and action as structured data
 * logger.info("User action completed", { userId: 123, action: "login" });
 * // Results in: <134>1 2024-01-01T12:00:00.000Z hostname myapp 1234 - [myapp@12345 userId="123" action="login"] User action completed
 * ```
 *
 * @since 0.12.0
 * @see {@link https://tools.ietf.org/html/rfc5424} RFC 5424 - The Syslog Protocol
 * @see {@link SyslogSinkOptions} for detailed configuration options
 */
export function getSyslogSink(
  options: SyslogSinkOptions = {},
): Sink & AsyncDisposable {
  const hostname = options.hostname ?? "localhost";
  const port = options.port ?? 514;
  const protocol = options.protocol ?? "udp";
  const secure = options.secure ?? false;
  const tlsOptions = options.tlsOptions;
  const facility = options.facility ?? "local0";
  const appName = options.appName ?? "logtape";
  const syslogHostname = options.syslogHostname ?? getSystemHostname();
  const processId = options.processId ?? getProcessId();
  const timeout = options.timeout ?? 5000;
  const includeStructuredData = options.includeStructuredData ?? false;
  const structuredDataId = options.structuredDataId ?? "logtape@32473";

  const formatOptions = {
    facility,
    appName,
    syslogHostname,
    processId,
    includeStructuredData,
    structuredDataId,
  };

  // Create connection based on protocol and runtime
  const connection: SyslogConnection = (() => {
    if (typeof Deno !== "undefined") {
      // Deno runtime
      return protocol === "tcp"
        ? new DenoTcpSyslogConnection(
          hostname,
          port,
          timeout,
          secure,
          tlsOptions,
        )
        : new DenoUdpSyslogConnection(hostname, port, timeout);
    } else {
      // Node.js runtime (and Bun, which uses Node.js APIs)
      return protocol === "tcp"
        ? new NodeTcpSyslogConnection(
          hostname,
          port,
          timeout,
          secure,
          tlsOptions,
        )
        : new NodeUdpSyslogConnection(hostname, port, timeout);
    }
  })();

  let isConnected = false;
  let lastPromise = Promise.resolve();

  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    const syslogMessage = formatSyslogMessage(record, formatOptions);

    lastPromise = lastPromise
      .then(async () => {
        if (!isConnected) {
          await connection.connect();
          isConnected = true;
        }
        await connection.send(syslogMessage);
      })
      .catch((error) => {
        // If connection fails, try to reconnect on next message
        isConnected = false;
        throw error;
      });
  };

  sink[Symbol.asyncDispose] = async () => {
    await lastPromise.catch(() => {}); // Wait for any pending operations
    connection.close();
    isConnected = false;
  };

  // Expose for testing purposes
  Object.defineProperty(sink, "_internal_lastPromise", {
    get: () => lastPromise,
    enumerable: false,
  });

  return sink;
}
