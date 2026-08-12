# AI Contracts

## State
`createAiState()` returns a versioned snapshot. The snapshot is observational: an AI should not mutate the live React state.

Schema: `schemas/ai-state.schema.json`

## Commands
Use `createAiCommand(type, payload)` and only the values in `AI_ACTIONS`.

Schema: `schemas/ai-command.schema.json`

## Rule
An AI decision is a request to the application/game engine. It is not permission to mutate the domain directly.
