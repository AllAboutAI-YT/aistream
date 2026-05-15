# AIStream PRD

## 1. Summary

AIStream is a local livestream director for Twitch-style broadcasts. It runs on the operator's Mac mini, drives OBS Studio for compositing and Twitch output, and exposes a single control surface (web UI, HTTP API, Twitch chat, and local voice) for switching between cameras and remote screens during a stream.

The product target is a single-operator setup that can be redeployed at customer sites with minimal hand-holding.

## 2. Background

Stream operators today juggle OBS plus several remote ffmpeg/SRT publishers and have no unified way to react to chat or take dictation while a stream is live. AIStream sits in front of OBS and lets the operator (or chat) drive scene changes without touching the OBS UI, while keeping the actual encoder/compositor stack local.

## 3. Goals

- Switch between operator-defined OBS scenes from web UI, HTTP API, Twitch chat, or local voice.
- Keep the streaming pipeline local-first and low-latency. No cloud round-trips on the hot path.
- Let Twitch chat switch scenes, but rate-limit chat-driven switches with a configurable dwell so the stream can't be flickered by viewers.
- Let the operator drive scenes hands-free with short voice commands.
- Let the operator dictate text into any focused field by holding a single physical key.
- Provide spoken confirmations for accepted voice commands.
- Make first-time deployment reproducible from a written runbook (see README) and one config file.

## 4. Non-Goals

- No cloud compositing. OBS remains the encoder.
- No production-grade auth. The web UI is for trusted LAN / localhost.
- No conversational dialog model. Voice control is intent matching plus optional TTS confirmations.
- No headless OBS replacement.
- No automatic OBS scene/source provisioning. Scenes are configured manually once.

## 5. Users and Use Cases

| User | Primary use cases |
|---|---|
| Stream operator | Switch scenes from the web UI; start/stop the stream; hold Shift to dictate notes; speak voice commands while presenting. |
| Twitch viewer | Request a specific camera via chat commands (`!dgx`, `!macbookcam`, ...). |
| Upstream agent (future) | Programmatically suggest scene changes via the agent decision endpoint, gated by a confidence threshold. |

## 6. System Overview

```text
Remote MacBook  ─┐
Remote DGX/Spark ─┼─ SRT over LAN ─► Mac mini ffmpeg relays ─► OBS Media Sources
Other cameras    ─┘

OBS Studio ──► Twitch RTMP(S)
   ▲
   │ OBS WebSocket
   │
AIStream director (Node/TypeScript)
   ├── Web UI / HTTP API
   ├── Twitch chat command listener
   ├── Local voice command listener
   ├── Hold-to-dictate listener
   └── Pocket TTS for confirmations
```

The director runs as a small Node process on the Mac mini. The voice and dictation listeners are independent helper processes that talk to the director over its HTTP API.

## 7. Functional Requirements

### 7.1 Scene control

- The product MUST expose a list of configured sources (scenes plus optional SRT inputs) defined in a single source-registry file.
- The operator MUST be able to switch the OBS program scene from the web UI, the HTTP API, Twitch chat, voice, or an upstream agent.
- Each switch MUST be recorded with timestamp, source, reason, and accepted/rejected outcome. The most recent decisions MUST be visible in the UI.
- A switch request for an unknown source MUST fail cleanly without affecting OBS.
- The product MUST keep working when OBS is offline (status endpoints stay available; switch attempts surface a clear error).

### 7.2 Twitch chat control

- The product MUST connect to Twitch IRC over WebSocket using a configured channel, username, and OAuth token.
- A configurable map of chat commands (`!holding`, `!dgx`, ...) MUST translate to scene IDs.
- After a successful chat-driven switch, additional chat-driven switches MUST be ignored for a configurable dwell period (default 15 s).
- Operator switches (UI / API / voice / agent) MUST NOT be blocked by the chat dwell lock.
- Chat connection state and recent commands (accepted and ignored, with reason) MUST be visible in the UI.
- The chat listener MUST automatically reconnect on socket loss.

### 7.3 Local voice control

- The product MUST accept short, intent-shaped voice commands ("switch to DGX", "show MacBook cam") and route them to the same switch path as manual control.
- A command MUST contain a recognized intent verb ("switch", "show", "go to", ...) to be considered, to avoid false positives from background speech.
- Per-scene phrase variations MUST be tolerant of common mistranscriptions ("ggx" → DGX, "mb cam" → MacBook camera, ...).
- Voice-driven switches MUST be rate-limited by a configurable cooldown.
- Transcription MUST run locally by default (Whisper) and MUST also support a pluggable remote ASR endpoint for off-device inference.
- Voice control MUST be runnable as a separate process so it can be enabled or disabled without restarting the director.

### 7.4 Hold-to-dictate

- The operator MUST be able to hold left Shift to start dictating into the currently focused text field and release it to paste the captured text.
- Dictation MUST be coalesced into a single paste on release, not streamed keystroke-by-keystroke.
- Holding Shift MUST NOT switch scenes, even if the spoken text matches a scene phrase. Scene voice commands and dictation MUST be mutually exclusive within a chunk.
- Standard dictation control phrases ("cancel dictation", "send", "new line") SHOULD be supported.
- If the operator stops speaking but keeps Shift held, the captured text SHOULD be flushed after a configurable idle period.
- Dictation MUST be a strictly opt-in feature (off by default).

### 7.5 TTS confirmations

- When voice control accepts a switch, the product SHOULD speak a short local confirmation ("DGX is live").
- When voice control rejects a switch, the product SHOULD speak a short failure message.
- TTS MUST be opt-in and MUST NOT block the main loop.

### 7.6 Web UI and HTTP API for operators

- The web UI MUST display: OBS connection state, stream active/inactive, current scene, source list with per-source health, recent decisions, chat connection state + recent commands + dwell countdown.
- The web UI MUST provide a manual switch control per source and a form for sending synthetic agent decisions.
- The HTTP API MUST expose endpoints for: list sources, get status, switch source, submit agent decision, start stream, stop stream.
- The agent decision endpoint MUST reject decisions whose confidence is below a configurable threshold without contacting OBS.

## 8. Non-Functional Requirements

- **Latency:** A voice or chat command MUST result in an OBS scene change within ~2 s of the spoken/typed input on the target hardware.
- **Reliability:** Director, voice, and dictation MUST each be restartable independently. Restarting the director MAY drop in-memory decision logs but MUST NOT require touching OBS.
- **Local-first:** With the exception of Twitch IRC and the live RTMP egress, no functionality MUST require an internet round-trip.
- **Security:** Secrets (Twitch OAuth, OBS WebSocket password, stream key) MUST live only in environment variables / `.env`, never in source. The web UI MUST default to localhost only.
- **Deployability:** A new customer site MUST be reachable from "clean Mac mini" to "switching scenes from the UI" by following a single written runbook.
- **Configurability:** Scenes, intents, and chat commands MUST be editable in a single registry file without code changes.

## 9. Acceptance Criteria

A deployment is considered live when all of the following are true:

- The director connects to OBS WebSocket and lists every configured scene.
- Manual switching works for every configured scene from the web UI.
- ffmpeg SRT relays bind their configured UDP ports and remote publishers connect without errors.
- OBS displays the expected scenes for each remote feed plus the local screen, full cam, and holding.
- The stream can be started and stopped via the API.
- A chat command switches a scene and locks further chat switches for the configured dwell.
- A spoken voice command switches a scene.
- Holding left Shift, speaking, and releasing pastes the transcribed text into the focused field.
- Pocket TTS produces an audible confirmation when voice switches are accepted (when TTS is enabled).

## 10. Open Questions

- Should the dictation trigger be configurable (key, modifier, file path) per operator, or is left-Shift a permanent product decision?
- Should chat command cooldowns become per-user or per-command, rather than a single global lock?
- Should the relays be supervised by the director, or remain operator-launched terminals?

## 11. Future Enhancements

- Service-manager-style supervision of relays and AIStream itself.
- OBS scene/source auto-provisioning from `sources.json`.
- TTS routed into OBS program audio (via BlackHole or a dedicated source).
- Per-user chat cooldowns and mod-only commands.
- On-screen overlay of accepted chat/voice commands.
- DGX-hosted conversational stream host.
