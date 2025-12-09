import { getLogger } from "@logtape/logtape";
import { WindowsEventLogError } from "./types.ts";

/**
 * Windows Event Log API constants and types for FFI.
 * @since 1.0.0
 */

// Event Log types
export const EVENTLOG_SUCCESS = 0x0000;
export const EVENTLOG_ERROR_TYPE = 0x0001;
export const EVENTLOG_WARNING_TYPE = 0x0002;
export const EVENTLOG_INFORMATION_TYPE = 0x0004;

// FFI symbol definitions for Windows Event Log APIs
const FFI_SYMBOLS = {
  RegisterEventSourceA: {
    parameters: ["pointer", "pointer"] as const,
    result: "pointer" as const,
  },
  DeregisterEventSource: {
    parameters: ["pointer"] as const,
    result: "u32" as const,
  },
  ReportEventA: {
    parameters: [
      "pointer", // hEventLog
      "u16", // wType
      "u16", // wCategory
      "u32", // dwEventID
      "pointer", // lpUserSid
      "u16", // wNumStrings
      "u32", // dwDataSize
      "pointer", // lpStrings
      "pointer", // lpRawData
    ] as const,
    result: "u32" as const,
  },
} as const;

/**
 * Windows Event Log FFI wrapper class for Deno.
 * Provides direct access to Windows Event Log APIs through Deno's FFI.
 *
 * @since 1.0.0
 */
export class WindowsEventLogFFI {
  private lib: Deno.DynamicLibrary<typeof FFI_SYMBOLS> | null = null;
  private eventSource: Deno.PointerValue | null = null;
  private encoder = new TextEncoder();
  private metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  constructor(private sourceName: string) {}

  /**
   * Initializes the FFI library and registers the event source.
   * @throws {WindowsEventLogError} If initialization fails
   */
  initialize(): void {
    try {
      // Load advapi32.dll
      this.lib = Deno.dlopen("advapi32.dll", FFI_SYMBOLS);

      // Register event source
      const sourceNamePtr = Deno.UnsafePointer.of(
        this.encoder.encode(this.sourceName + "\0"),
      );
      this.eventSource = this.lib.symbols.RegisterEventSourceA(
        null,
        sourceNamePtr,
      );

      if (!this.eventSource) {
        throw new WindowsEventLogError(
          `Failed to register event source '${this.sourceName}'.`,
        );
      }
    } catch (error) {
      if (error instanceof WindowsEventLogError) {
        throw error;
      }
      throw new WindowsEventLogError(
        `Failed to initialize Windows Event Log FFI: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Writes a message to the Windows Event Log.
   *
   * @param eventType Event type (error, warning, info)
   * @param eventId Event ID number that gives us formatting string
   * @param messages Message parameter strings to log
   * @throws {WindowsEventLogError} If the write operation fails
   */
  writeEvent(eventType: number, eventId: number, messages: string[]): void {
    if (!this.lib || !this.eventSource) {
      throw new WindowsEventLogError(
        "FFI not initialized. Call initialize() first.",
      );
    }

    try {
      const unsafePointersToStrings: bigint[] = [];
      for (let i = 0; i < messages.length; i++) {
        // Prepare message string
        const messageBuffer = this.encoder.encode(messages[i] + "\0");
        const messagePtr = Deno.UnsafePointer.of(messageBuffer);
        const messagePtrValue = messagePtr
          ? Deno.UnsafePointer.value(messagePtr)
          : 0n;
        unsafePointersToStrings.push(messagePtrValue);
      }
      const stringsArray = new BigUint64Array(unsafePointersToStrings);
      const stringsPtr = Deno.UnsafePointer.of(stringsArray);

      // Call ReportEventA
      const result = this.lib.symbols.ReportEventA(
        this.eventSource, // hEventLog
        eventType, // wType
        0, // wCategory (0 = no category)
        eventId, // dwEventID
        null, // lpUserSid (null = current user)
        stringsArray.length, // wNumStrings
        0, // dwDataSize (no additional data)
        stringsPtr, // lpStrings
        null, // lpRawData (no additional data)
      );

      if (result === 0) {
        throw new WindowsEventLogError(
          `Failed to write event to Event Log.`,
        );
      }
    } catch (error) {
      if (error instanceof WindowsEventLogError) {
        throw error;
      }
      throw new WindowsEventLogError(
        `Error writing to Event Log: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Cleans up resources and deregisters the event source.
   */
  dispose(): void {
    if (this.lib && this.eventSource) {
      try {
        this.lib.symbols.DeregisterEventSource(this.eventSource);
      } catch (error) {
        this.metaLogger.error(
          "Failed to deregister event source during cleanup: {error}",
          { error },
        );
      }
      this.eventSource = null;
    }

    if (this.lib) {
      try {
        this.lib.close();
      } catch (error) {
        this.metaLogger.error(
          "Failed to close FFI library during cleanup: {error}",
          { error },
        );
      }
      this.lib = null;
    }
  }
}
