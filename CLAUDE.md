# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OpenCode is an AI coding agent built for the terminal - a 100% open-source alternative to Claude Code. It uses a client-server architecture with a TypeScript backend, Go-based terminal UI, and Astro documentation site.

## Essential Development Commands

### Setup and Running
```bash
# Install dependencies (requires Bun)
bun install

# Run opencode in development mode
bun run dev

# Run tests
bun test

# Run a specific test file
bun test test/tool/tool.test.ts

# Type check all packages
bun run typecheck

# Format code
bunx prettier --write .
```

### After API Changes
**IMPORTANT**: When modifying server endpoints in `packages/opencode/src/server/server.ts`, you MUST regenerate the Go SDK:
```bash
./scripts/stainless
```

### Web Documentation
```bash
# Run docs locally
cd packages/web && bun run dev

# Build docs
cd packages/web && bun run build
```

## Architecture and Code Organization

### Package Structure
- `packages/opencode/` - Core TypeScript backend and CLI
  - `src/tool/` - AI tool implementations (read, write, edit, grep, etc.)
  - `src/server/` - API server endpoints
  - `src/provider/` - AI provider integrations
  - `test/` - Test files using Bun test runner
- `packages/tui/` - Go terminal UI (Bubble Tea framework)
  - `sdk/` - Generated client SDK for API communication
- `packages/web/` - Astro documentation site

### Key Architectural Patterns

1. **Namespace-based APIs**: Core functionality organized into namespaces
   ```typescript
   Tool.define()
   Session.create()
   Storage.get()
   Log.create({ service: "name" })
   ```

2. **Validation**: Use Zod schemas for all input validation
   ```typescript
   const schema = z.object({ ... })
   ```

3. **Error Handling**: Prefer Result patterns over exceptions
   ```typescript
   return { ok: true, value: result }
   return { ok: false, error: "message" }
   ```

4. **Tool System**: Each tool has:
   - Implementation file: `tool/toolname.ts`
   - Description file: `tool/toolname.txt`
   - Schema validation for inputs

## Code Style Guidelines (from AGENTS.md)

### PREFER
- Single word variable/function names
- Bun APIs (e.g., `Bun.file()` over `fs`)
- Inline functionality unless reusable
- Named imports: `import { Thing } from "./module"`
- Early returns over nested conditions

### AVOID
- `try/catch` blocks where possible
- `else` statements
- `any` type
- `let` statements (use `const`)
- Unnecessary destructuring
- Creating helper functions unless truly reusable

## Important Development Notes

1. **Client-Server Communication**: The Go TUI communicates with the TypeScript server via a Stainless-generated SDK. Always regenerate after API changes.

2. **Tool Development**: When creating new tools:
   - Add implementation in `packages/opencode/src/tool/`
   - Create corresponding `.txt` description file
   - Follow existing tool patterns for consistency

3. **Testing**: Write tests for new functionality in `packages/opencode/test/`
   - Use Bun's snapshot testing for tool outputs
   - Test edge cases and error conditions

4. **Provider Integration**: When adding new AI providers:
   - Implement in `packages/opencode/src/provider/`
   - Handle model transformations and tool conversions
   - Update provider registry

5. **Dependencies**: This is a monorepo using Bun workspaces. Dependencies are managed via catalog in root `package.json`.

## Contributing Guidelines

Per README.md:
- **Core features require design process** - No PRs for fundamental features
- **Accepted contributions**:
  - Bug fixes
  - LLM performance improvements
  - New provider support
  - Environment-specific fixes
  - Documentation improvements

## Environment Requirements

- **Bun**: v1.2.14+ (primary package manager and runtime)
- **Go**: v1.24.0+ (for TUI development)
- **Node.js**: For some tooling compatibility