import { getLogger } from "@logtape/logtape";
// @ts-types="npm:@types/bun@^1.2.16"
import { dlopen, FFIType, ptr } from "bun:ffi";
import type { EventType } from "./types.ts";

/**
 * Bun FFI implementation for Windows Event Log API
 */
export class WindowsEventLogFFI {
  private eventSource: number | null = null;
  // deno-lint-ignore no-explicit-any
  private lib: any = null;
  private sourceName: string;
  private initialized = false;
  private metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  constructor(sourceName: string) {
    this.sourceName = sourceName;
  }

  /**
   * Initialize the FFI bindings and register event source
   */
  initialize(): void {
    if (this.initialized) return;

    try {
      // Load advapi32.dll using Bun FFI
      this.lib = dlopen("advapi32.dll", {
        RegisterEventSourceA: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.ptr,
        },
        ReportEventA: {
          args: [
            FFIType.ptr, // hEventLog
            FFIType.u16, // wType
            FFIType.u16, // wCategory
            FFIType.u32, // dwEventID
            FFIType.ptr, // lpUserSid
            FFIType.u16, // wNumStrings
            FFIType.u32, // dwDataSize
            FFIType.ptr, // lpStrings - pointer to array of string pointers
            FFIType.ptr, // lpRawData
          ],
          returns: FFIType.bool,
        },
        DeregisterEventSource: {
          args: [FFIType.ptr],
          returns: FFIType.bool,
        },
      });

      // Register event source using cstring
      // Create a buffer for the source name
      const encoder = new TextEncoder();
      const sourceNameBuffer = encoder.encode(this.sourceName + "\0");

      const result = this.lib.symbols.RegisterEventSourceA(
        null,
        sourceNameBuffer,
      );
      this.eventSource = typeof result === "number" ? result : null;

      if (!this.eventSource || this.eventSource === 0) {
        throw new Error(
          `Failed to register event source: ${this.sourceName}`,
        );
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize Windows Event Log FFI: ${error}`,
      );
    }
  }

  /**
   * Write an event to Windows Event Log
   */
  writeEvent(eventType: EventType, eventId: number, messages: string[]): void {
    if (!this.initialized || !this.eventSource || !this.lib) {
      return;
    }

    try {
      // Create pointer array for strings
      const ptrArray = new BigUint64Array(messages.length + 1);

      // Use string array approach which works with Bun FFI
      const encoder = new TextEncoder();
      for (let i = 0; i < messages.length; i++) {
        const messageBuffer = encoder.encode(messages[i] + "\0");
        ptrArray[i] = BigInt(ptr(messageBuffer));
      }
      ptrArray[messages.length] = 0n; // null terminator

      const success = this.lib.symbols.ReportEventA(
        this.eventSource,
        eventType,
        0, // category
        eventId,
        null, // user SID (null)
        messages.length, // number of strings
        0, // data size
        ptrArray, // pointer to array of string pointers
        null, // raw data (null)
      );

      if (!success) {
        throw new Error(`ReportEventA returned false`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.initialized && this.eventSource && this.lib) {
      try {
        this.lib.symbols.DeregisterEventSource(this.eventSource);
      } catch (error) {
        this.metaLogger.error(
          "Failed to deregister event source during cleanup: {error}",
          { error },
        );
      }
      this.eventSource = null;
      this.initialized = false;

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

// cSpell: ignore cstring
