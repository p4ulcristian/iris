#!/usr/bin/env node
/**
 * Iris MCP Server - unified API for all Iris functionality.
 *
 * Tools:
 *   Gods & Entities:
 *     - spawn_god: Summon a new god (Claude instance)
 *     - peek_god: View god's terminal output
 *     - push_to_god: Send input to god's terminal
 *     - list_entities: List all active entities
 *
 *   UI:
 *     - set_title: Set god's title (auto-detects god from GOD_NAME env)
 *     - set_ready: Set god's ready state (auto-detects god from GOD_NAME env)
 *     - browse: Open URL in browser
 *     - open_code: Open file in code viewer
 *     - highlight_code: Highlight lines in code viewer
 *     - clear_highlights: Clear code highlights
 *     - open_markdown: Open markdown file
 *
 *   Voice:
 *     - speak: Speak text via TTS
 *     - greet: Time-aware greeting
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";

const API_BASE = "http://127.0.0.1:9998/api";

// Get god name from environment (set by Iris when spawning gods)
const GOD_NAME = process.env.GOD_NAME;

// =============================================================================
// HTTP Helpers
// =============================================================================

async function apiPost(endpoint, data, timeout = 5000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(id);
    return res.ok ? await res.json() : { error: await res.text() };
  } catch (e) {
    return { error: e.message };
  }
}

async function apiGet(endpoint, timeout = 5000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(`${API_BASE}/${endpoint}`, {
      signal: controller.signal
    });

    clearTimeout(id);
    return res.ok ? await res.json() : { error: await res.text() };
  } catch (e) {
    return { error: e.message };
  }
}

// Response helpers
function ok(msg) {
  return { content: [{ type: "text", text: msg }] };
}

function fail(msg) {
  return { content: [{ type: "text", text: msg }] };
}

// Resolve relative paths to absolute
function resolvePath(filePath) {
  if (filePath.startsWith("/")) return filePath;
  return resolve(process.cwd(), filePath);
}

// =============================================================================
// MCP Server Setup
// =============================================================================

const server = new McpServer({
  name: "iris",
  version: "2.0.0"
});

// =============================================================================
// Gods & Entities
// =============================================================================

server.tool(
  "spawn_god",
  "Summon a new god (Claude instance) in Iris to work on a task.",
  {
    task: z.string().describe("Description of what the god should work on"),
    god_name: z.string().optional().describe("Optional god name (random if not specified)"),
    project: z.string().optional().describe("Optional project name to work in")
  },
  async ({ task, god_name, project }) => {
    const health = await apiGet("health");
    if (health.error) return fail("Failed to spawn god - is Iris running?");

    const data = { event: "god:spawn", task };
    if (god_name) data.name = god_name;
    if (project) data.project = project;

    const result = await apiPost("spawn", data);
    if (result.error) return fail(`Failed to spawn god: ${result.error}`);

    return ok(`Summoned ${result.name || "god"} to work on: ${task}`);
  }
);

server.tool(
  "peek_god",
  "View recent terminal output from a god.",
  {
    god_name: z.string().describe("The god to peek at"),
    lines: z.number().default(50).describe("Number of lines to retrieve")
  },
  async ({ god_name, lines }) => {
    const result = await apiPost("peek", { god: god_name, lines });
    if (result.error) return fail(`Failed to peek: ${result.error}`);
    return ok(result.output || "No output");
  }
);

server.tool(
  "peek_terminal",
  "View recent terminal output from a terminal.",
  {
    terminal_name: z.string().describe("The terminal to peek at (e.g., 'Terminal 1')"),
    lines: z.number().default(50).describe("Number of lines to retrieve")
  },
  async ({ terminal_name, lines }) => {
    const result = await apiPost("peek-terminal", { terminal: terminal_name, lines });
    if (result.error) return fail(`Failed to peek: ${result.error}`);
    return ok(result.output || "No output");
  }
);

server.tool(
  "push_to_god",
  "Send text input to a god's terminal.",
  {
    god_name: z.string().describe("The god to send input to"),
    text: z.string().describe("Text to send (will be followed by Enter)")
  },
  async ({ god_name, text }) => {
    const result = await apiPost("push", { god: god_name, text });
    if (result.error) return fail(`Failed to push: ${result.error}`);
    return ok(`Sent to ${god_name}: ${text}`);
  }
);

server.tool(
  "push_to_terminal",
  "Send text input to a terminal.",
  {
    terminal_name: z.string().describe("The terminal to send input to (e.g., 'Terminal 1')"),
    text: z.string().describe("Text to send (will be followed by Enter)")
  },
  async ({ terminal_name, text }) => {
    const result = await apiPost("push-terminal", { terminal: terminal_name, text });
    if (result.error) return fail(`Failed to push: ${result.error}`);
    return ok(`Sent to ${terminal_name}: ${text}`);
  }
);

server.tool(
  "run_terminal",
  "Run command in visible terminal, wait for output. Creates terminal if needed.",
  {
    command: z.string().describe("Shell command to execute"),
    god_name: z.string().optional().describe("God name for terminal (default: Hermes)"),
    raw: z.boolean().default(true).describe("Clean terminal output (default: true). Set false for wrapped mode with file capture.")
  },
  async ({ command, god_name, raw }) => {
    const god = god_name || GOD_NAME || "Hermes";
    const result = await apiPost("run", { god, command, raw }, 40000); // 40s timeout

    if (result.error) return fail(`Command failed: ${result.error}`);

    const output = result.output || "(no output)";
    return ok(`Exit ${result.exitCode ?? "?"}\n${output}`);
  }
);

server.tool(
  "list_entities",
  "List all active entities (gods, terminals, browsers, etc.) in Iris.",
  {},
  async () => {
    const result = await apiPost("entities", {});
    if (result.error) return fail(`Failed to list: ${result.error}`);

    const entities = result.entities || [];
    if (!entities.length) return ok("No active entities");

    const lines = entities.map(e =>
      `- ${e.name || "Unknown"} (${e.type || "entity"}): ${e.readyState || "unknown"}`
    );
    return ok(lines.join("\n"));
  }
);

// =============================================================================
// UI - Title & State (auto-detect god from GOD_NAME env)
// =============================================================================

server.tool(
  "set_title",
  "Set your title/goal displayed in the UI. Uses GOD_NAME env var if god_name not specified.",
  {
    title: z.string().describe("The title to display"),
    god_name: z.string().optional().describe("God to update (defaults to self via GOD_NAME env)")
  },
  async ({ title, god_name }) => {
    const god = god_name || GOD_NAME;
    if (!god) return fail("No god specified and GOD_NAME env not set");

    const result = await apiPost("title", { god, title });
    if (result.error) return fail(`Failed to set title: ${result.error}`);
    return ok(`Set title to: ${title}`);
  }
);

server.tool(
  "set_ready",
  "Set your ready state for visual feedback in UI. Uses GOD_NAME env var if god_name not specified.",
  {
    state: z.enum(["working", "done", "stuck", "question"]).describe("The ready state"),
    god_name: z.string().optional().describe("God to update (defaults to self via GOD_NAME env)")
  },
  async ({ state, god_name }) => {
    const god = god_name || GOD_NAME;
    if (!god) return fail("No god specified and GOD_NAME env not set");

    const result = await apiPost("ready", { god, state });
    if (result.error) return fail(`Failed to set state: ${result.error}`);
    return ok(`Set state to: ${state}`);
  }
);

// =============================================================================
// UI - Views
// =============================================================================

server.tool(
  "browse",
  "Open a URL in the Iris browser.",
  {
    url: z.string().describe("The URL to open")
  },
  async ({ url }) => {
    // Normalize URL
    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/")) {
      normalizedUrl = `https://${url}`;
    }

    const result = await apiPost("browse", { url: normalizedUrl });
    if (result.error) return fail(`Failed to open browser: ${result.error}`);
    return ok(`Opened browser: ${normalizedUrl}`);
  }
);

server.tool(
  "open_code",
  "Open a file in the Iris code viewer.",
  {
    path: z.string().describe("Path to the file (relative or absolute)"),
    line: z.number().optional().describe("Optional line number to jump to"),
    project: z.string().optional().describe("Optional project name for context")
  },
  async ({ path, line, project }) => {
    const absPath = resolvePath(path);
    const data = { path: absPath };
    if (line) data.line = line;
    if (project) data.project = project;

    const result = await apiPost("code", data);
    if (result.error) return fail(`Failed to open code: ${result.error}`);
    return ok(`Opened: ${path}${line ? `:${line}` : ""}`);
  }
);

server.tool(
  "highlight_code",
  "Highlight lines in the code viewer with a color and optional note.",
  {
    path: z.string().describe("Path to the file"),
    lines: z.string().describe("Lines to highlight (e.g., '10', '10-20', '5,10-15,20')"),
    color: z.enum(["yellow", "red", "green", "blue", "orange", "purple", "cyan"]).describe("Highlight color"),
    note: z.string().optional().describe("Optional note to display with highlight")
  },
  async ({ path, lines, color, note }) => {
    const absPath = resolvePath(path);

    // Parse lines string into ranges with validation
    const highlights = [];
    for (const part of lines.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes("-")) {
        const [startStr, endStr] = trimmed.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end)) return fail(`Invalid line range: ${trimmed}`);
        highlights.push({ line: start, endLine: end, color, ...(note && { note }) });
      } else {
        const line = parseInt(trimmed, 10);
        if (isNaN(line)) return fail(`Invalid line number: ${trimmed}`);
        highlights.push({ line, endLine: line, color, ...(note && { note }) });
      }
    }

    if (!highlights.length) return fail("No valid line numbers provided");

    const result = await apiPost("code/highlight", { path: absPath, highlights });
    if (result.error) return fail(`Failed to highlight: ${result.error}`);
    return ok(`Highlighted ${lines} in ${color}`);
  }
);

server.tool(
  "clear_highlights",
  "Clear highlights from code viewer.",
  {
    path: z.string().optional().describe("Path to clear highlights from (clears all if not specified)")
  },
  async ({ path }) => {
    const data = path ? { path: resolvePath(path) } : {};
    const result = await apiPost("code/clear", data);
    if (result.error) return fail(`Failed to clear: ${result.error}`);
    return ok(path ? `Cleared highlights from ${path}` : "Cleared all highlights");
  }
);

server.tool(
  "open_markdown",
  "Open a markdown file in the Iris markdown viewer.",
  {
    path: z.string().describe("Path to the markdown file")
  },
  async ({ path }) => {
    const absPath = resolvePath(path);
    const result = await apiPost("md", { path: absPath });
    if (result.error) return fail(`Failed to open markdown: ${result.error}`);
    return ok(`Opened: ${path}`);
  }
);

// =============================================================================
// Voice
// =============================================================================

server.tool(
  "speak",
  "Speak aloud. Use liberally for status updates. Supports [sigh], [laugh], [gasp].",
  {
    text: z.string().describe("The text to speak"),
    voice: z.string().optional().describe("Optional voice name (defaults to god name)"),
    background: z.boolean().default(true).describe("Don't wait for speech to complete")
  },
  async ({ text, voice, background }) => {
    const data = { text, background };
    const voiceToUse = voice || GOD_NAME?.toLowerCase();
    if (voiceToUse) data.voice = voiceToUse;

    const result = await apiPost("say", data);
    if (result.error) return fail(`Failed to speak: ${result.error}`);
    const displayText = text.length > 50 ? `${text.slice(0, 50)}...` : text;
    return ok(`Speaking: ${displayText}`);
  }
);

server.tool(
  "greet",
  "Speak a time-aware greeting.",
  {
    voice: z.string().optional().describe("Optional voice name")
  },
  async ({ voice }) => {
    const hour = new Date().getHours();

    let greeting;
    if (hour < 5) {
      greeting = "Still up? The night is long.";
    } else if (hour < 12) {
      greeting = "Good morning.";
    } else if (hour < 17) {
      greeting = "Good afternoon.";
    } else if (hour < 21) {
      greeting = "Good evening.";
    } else {
      greeting = "Working late tonight.";
    }

    const data = { text: greeting, background: true };
    const voiceToUse = voice || GOD_NAME?.toLowerCase();
    if (voiceToUse) data.voice = voiceToUse;

    const result = await apiPost("say", data);
    if (result.error) return fail(`Failed to greet: ${result.error}`);
    return ok(greeting);
  }
);

// =============================================================================
// Start Server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
