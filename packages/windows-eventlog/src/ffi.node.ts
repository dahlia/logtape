import { getLogger } from "@logtape/logtape";
import type { EventType } from "./types.ts";

/**
 * Node.js FFI implementation for Windows Event Log API using koffi
 */
export class WindowsEventLogFFI {
  private eventSource: unknown = null;
  private koffi: unknown = null;
  private sourceName: string;
  private initialized = false;
  private lib: unknown = null;
  private metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  constructor(sourceName: string) {
    this.sourceName = sourceName;
  }

  /**
   * Initialize the FFI bindings and register event source
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import for koffi
      const koffiModule = await import("koffi");
      this.koffi = koffiModule.default || koffiModule;

      // Load advapi32.dll
      this.lib = (this.koffi as unknown as { load: (lib: string) => unknown })
        .load("advapi32.dll");

      // Define Windows API functions with correct koffi types using __stdcall convention
      const RegisterEventSourceA =
        (this.lib as unknown as { func: (sig: string) => unknown }).func(
          "uintptr __stdcall RegisterEventSourceA(uintptr lpUNCServerName, str lpSourceName)",
        );
      // ReportEventA expects LPCSTR* (array of string pointers) for lpStrings
      // Use char** for null-terminated array of strings
      const ReportEventA =
        (this.lib as unknown as { func: (sig: string) => unknown }).func(
          "bool __stdcall ReportEventA(uintptr hEventLog, uint16 wType, uint16 wCategory, uint32 dwEventID, uintptr lpUserSid, uint16 wNumStrings, uint32 dwDataSize, char** lpStrings, uint8* lpRawData)",
        );
      const DeregisterEventSource =
        (this.lib as unknown as { func: (sig: string) => unknown }).func(
          "bool __stdcall DeregisterEventSource(uintptr hEventLog)",
        );

      // Store functions
      this.RegisterEventSourceA = RegisterEventSourceA;
      this.ReportEventA = ReportEventA;
      this.DeregisterEventSource = DeregisterEventSource;

      // Register event source
      this.eventSource = (this.RegisterEventSourceA as unknown as (
        ...args: unknown[]
      ) => unknown)(0, this.sourceName);

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

  private RegisterEventSourceA: unknown = null;
  private ReportEventA: unknown = null;
  private DeregisterEventSource: unknown = null;

  /**
   * Write an event to Windows Event Log
   */
  writeEvent(eventType: EventType, eventId: number, messages: string[]): void {
    if (!this.initialized || !this.eventSource || !this.ReportEventA) {
      return;
    }

    try {
      // Create null-terminated strings
      // In koffi, we pass an array of strings for char**
      const nullTerminatedMessages = messages.map((s) => s + "\0");

      // Report the event using strings array approach
      const success =
        (this.ReportEventA as unknown as (...args: unknown[]) => unknown)(
          this.eventSource,
          eventType,
          0, // category
          eventId,
          0, // user SID (null)
          nullTerminatedMessages.length, // number of strings
          0, // data size (0 - not using raw data)
          nullTerminatedMessages, // strings array with our message
          null, // raw data (null - not using)
        );

      if (!success) {
        throw new Error("ReportEventA() returned false.");
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.initialized && this.eventSource && this.DeregisterEventSource) {
      try {
        (this.DeregisterEventSource as unknown as (
          ...args: unknown[]
        ) => unknown)(this.eventSource);
      } catch (error) {
        this.metaLogger.error(
          "Failed to deregister event source during cleanup: {error}",
          { error },
        );
      }
      this.eventSource = null;
      this.initialized = false;
    }
  }
}
