# AIStream

A local livestream director for Twitch-style broadcasts. Runs on a Mac mini, drives OBS Studio for compositing and Twitch output, and exposes a single control surface — web UI, HTTP API, Twitch chat, and local voice — for switching between cameras and remote screens during a stream.

See [`stream_prd.md`](./stream_prd.md) for the full product requirements.

## Status

Pre-implementation. The PRD is the source of truth; phases are decomposed and shipped one PR at a time, gated by CodeRabbit review (see [`CLAUDE.md`](./CLAUDE.md)).

## Stack

- Node 20+, TypeScript (strict, ESM)
- OBS Studio + OBS WebSocket
- Twitch IRC over WebSocket
- Local Whisper (with pluggable remote ASR) for voice
- Pocket TTS for confirmations

## Quickstart

Not yet runnable. Setup runbook will land with the relevant phase.

## Configuration

Two files, both kept out of source control:

- `.env` — secrets (Twitch OAuth, OBS WebSocket password, stream key)
- `sources.json` — scene registry (scenes, chat commands, voice phrases)

Examples (`*.example`) will be checked in as templates.

## License

TBD.
