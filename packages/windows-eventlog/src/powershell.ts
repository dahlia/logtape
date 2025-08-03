import { spawn } from "node:child_process";
import { getRuntime } from "./platform.ts";

/**
 * Executes a PowerShell command and returns the output.
 * This is used for testing to verify that events were actually written to Windows Event Log.
 *
 * @param command PowerShell command to execute
 * @returns Promise resolving to the command output
 */
export async function runPowerShell(command: string): Promise<string> {
  const runtime = getRuntime();

  if (runtime === "deno") {
    return await runPowerShellDeno(command);
  } else if (runtime === "node") {
    return await runPowerShellNode(command);
  } else if (runtime === "bun") {
    return await runPowerShellBun(command);
  } else {
    throw new Error(`PowerShell execution not supported in ${runtime} runtime`);
  }
}

/**
 * Executes PowerShell command in Deno using Deno.Command
 */
async function runPowerShellDeno(command: string): Promise<string> {
  const cmd = new Deno.Command("powershell", {
    args: ["-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", command],
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();
  const { code, stdout, stderr } = await process.output();

  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    throw new Error(`PowerShell command failed: ${errorText}`);
  }

  return new TextDecoder().decode(stdout);
}

/**
 * Executes PowerShell command in Node.js using child_process
 */
function runPowerShellNode(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn("powershell", [
      "-ExecutionPolicy",
      "Bypass",
      "-NoProfile",
      "-Command",
      command,
    ]);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell command failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Executes PowerShell command in Bun using Bun.spawn
 */
async function runPowerShellBun(command: string): Promise<string> {
  // @ts-ignore - Bun global is not typed in Deno
  const proc = Bun.spawn([
    "powershell",
    "-ExecutionPolicy",
    "Bypass",
    "-NoProfile",
    "-Command",
    command,
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`PowerShell command failed: ${stderr}`);
  }

  return stdout;
}

/**
 * Verifies that events were logged to Windows Event Log for the given source.
 *
 * @param sourceName The event source name to check
 * @param maxEvents Maximum number of events to retrieve (default: 10)
 * @returns Promise resolving to array of event objects
 */
export async function verifyEventsLogged(
  sourceName: string,
  maxEvents: number = 10,
): Promise<EventLogEntry[]> {
  // Most effective approach: Look for very recent events by time and filter by our source
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Use a more direct PowerShell approach that properly extracts all fields
    const command =
      `Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime='${fiveMinutesAgo}'} -MaxEvents ${
        maxEvents * 20
      } | Where-Object { $_.ProviderName -eq '${sourceName}' } | ForEach-Object { [PSCustomObject]@{ Id = $_.Id; Level = $_.Level; Message = $_.Message; TimeCreated = $_.TimeCreated.ToString('o'); ProviderName = $_.ProviderName } } | Select-Object -First ${maxEvents} | ConvertTo-Json -Depth 3`;

    const output = await runPowerShell(command);

    if (output.trim()) {
      const parsed = JSON.parse(output);
      const events = Array.isArray(parsed) ? parsed : [parsed];

      return events.map(parseEventLogEntry);
    }
  } catch (_error) {
    // Direct provider query failed, trying fallback
  }

  // Fallback: Search by message content if provider name doesn't work
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const fallbackCommand =
      `Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime='${fiveMinutesAgo}'} -MaxEvents ${
        maxEvents * 50
      } | Where-Object { $_.Message -like '*${sourceName}*' } | ForEach-Object { [PSCustomObject]@{ Id = $_.Id; Level = $_.Level; Message = $_.Message; TimeCreated = $_.TimeCreated.ToString('o'); ProviderName = $_.ProviderName } } | Select-Object -First ${maxEvents} | ConvertTo-Json -Depth 3`;

    const output2 = await runPowerShell(fallbackCommand);

    if (output2.trim()) {
      const parsed = JSON.parse(output2);
      const events = Array.isArray(parsed) ? parsed : [parsed];

      return events.map(parseEventLogEntry);
    }
  } catch (_error) {
    // Fallback message search failed
  }

  return [];
}

/**
 * Represents a Windows Event Log entry
 */
export interface EventLogEntry {
  id: number;
  level: string;
  message: string;
  timeCreated: string;
  providerName: string;
}

/**
 * Parses a PowerShell event object into our EventLogEntry format
 */
function parseEventLogEntry(event: Record<string, unknown>): EventLogEntry {
  return {
    id: (event.Id as number) || 0,
    level: getLevelName((event.Level as number) || 4),
    message: (event.Message as string) || "",
    timeCreated: (event.TimeCreated as string) || new Date().toISOString(),
    providerName: (event.ProviderName as string) || "",
  };
}

/**
 * Converts Windows Event Log level number to readable name
 */
function getLevelName(level: number): string {
  switch (level) {
    case 1:
      return "Critical";
    case 2:
      return "Error";
    case 3:
      return "Warning";
    case 4:
      return "Information";
    case 5:
      return "Verbose";
    default:
      return `Level${level}`;
  }
}
