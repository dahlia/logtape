export interface WindowsEventLogFFI {
  /**
   * Initializes the FFI library and registers the event source.
   * @throws {WindowsEventLogError} If initialization fails
   */
  initialize(sourceName: string): void;

  /**
   * Writes a message to the Windows Event Log.
   *
   * @param eventType Event type (error, warning, info)
   * @param eventId Event ID number that gives us formatting string
   * @param params Message parameter strings to log
   * @throws {WindowsEventLogError} If the write operation fails
   */
  writeEvent(eventType: number, eventId: number, params: string[]): void;

  /**
   * Cleans up resources and deregisters the event source.
   */
  dispose(): void;
}
