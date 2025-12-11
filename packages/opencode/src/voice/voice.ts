import fs from "fs/promises"
import os from "os"
import path from "path"
import { Log } from "@/util/log"

type SummarizeInput = {
  text: string
  providerID?: string
  modelID?: string
  sessionID?: string
}

type Summarize = (input: SummarizeInput) => Promise<string | undefined>
type Speak = (text: string) => Promise<void>
type MessageMeta = { providerID?: string; modelID?: string; sessionID?: string }
type MessageMetaLookup = (messageID: string) => Promise<MessageMeta | undefined>

const DEFAULT_VOICE_ID = "lfj4CczyVcO97BdWCl7G"
const logger = Log.create({ service: "voice" })

export class VoiceManager {
  private textByMessage = new Map<string, string>()
  private sessionByMessage = new Map<string, string>()
  private pendingMessageID: string | undefined
  private spoken = new Set<string>()

  constructor(private deps: { summarize: Summarize; speak: Speak; getMeta?: MessageMetaLookup }) {}

  onTextPart(part: { messageID: string; sessionID: string; text: string }) {
    const existing = this.textByMessage.get(part.messageID) ?? ""
    const updated = (existing + part.text).trim()
    this.textByMessage.set(part.messageID, updated)
    this.sessionByMessage.set(part.messageID, part.sessionID)
    logger.debug("onTextPart", {
      messageID: part.messageID,
      textLength: updated.length,
      newText: part.text.substring(0, 50),
    })
  }

  onStepFinish(part: { messageID: string; sessionID: string }) {
    this.pendingMessageID = part.messageID
    this.sessionByMessage.set(part.messageID, part.sessionID)
    logger.debug("onStepFinish", {
      messageID: part.messageID,
      hasText: this.textByMessage.has(part.messageID),
    })
  }

  async onIdle() {
    const messageID = this.pendingMessageID
    logger.debug("onIdle called", {
      messageID,
      alreadySpoken: messageID ? this.spoken.has(messageID) : false,
    })

    if (!messageID || this.spoken.has(messageID)) return

    const text = this.textByMessage.get(messageID)
    logger.debug("onIdle text check", {
      messageID,
      hasText: !!text,
      textLength: text?.length,
    })

    if (!text) return

    const meta =
      (await this.deps.getMeta?.(messageID).catch(() => undefined)) ??
      ({ sessionID: this.sessionByMessage.get(messageID) } satisfies MessageMeta)

    logger.debug("summarizing text", { messageID, textPreview: text.substring(0, 100) })
    const summary = await this.deps
      .summarize({
        text,
        ...meta,
      })
      .catch((err) => {
        logger.error("summarize error", { error: err instanceof Error ? err.message : String(err) })
        return undefined
      })

    if (!summary) {
      logger.debug("no summary generated, skipping speech", { messageID })
      return
    }

    const spokenText = summary.trim()
    logger.debug("speaking text", {
      messageID,
      spokenLength: spokenText.length,
    })

    await this.deps.speak(spokenText).catch((error) => {
      logger.error("playback error", { error: error instanceof Error ? error.message : String(error) })
    })
    this.spoken.add(messageID)
    logger.debug("speech completed", { messageID })
  }
}

export function createVoiceSummarizer(): Summarize {
  return async (input) => {
    const text = input.text.trim()
    if (!text) return undefined

    const [{ Provider }, { ProviderTransform }, { Config }, { generateText }, { mergeDeep, pipe }] = await Promise.all([
      import("@/provider/provider"),
      import("@/provider/transform"),
      import("@/config/config"),
      import("ai"),
      import("remeda"),
    ])

    const model =
      input.providerID && input.modelID
        ? await Provider.getModel(input.providerID, input.modelID).catch(() => undefined)
        : await Provider.getSmallModel(input.providerID ?? "opencode").catch(() => undefined)

    if (!model) return undefined
    const language = await Provider.getLanguage(model)
    const cfg = await Config.get()
    const options = pipe(
      {},
      mergeDeep(ProviderTransform.options(model, input.sessionID ?? "voice")),
      mergeDeep(ProviderTransform.smallOptions(model)),
      mergeDeep(model.options),
    )

    const result = await generateText({
      model: language,
      maxOutputTokens: 20,
      providerOptions: ProviderTransform.providerOptions(model.api.npm, model.providerID, options),
      headers: model.headers,
      messages: [
        {
          role: "system",
          content:
            "Create a ONE SHORT SENTENCE (max 12 words) zoomer-speak summary. Must be unhinged gen-z energy. Examples: 'coded that feature no cap', 'bug fixed, it's giving main character', 'deployed fr fr'. ONLY respond with the single sentence, nothing else.",
        },
        { role: "user", content: text },
      ],
      experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
    })

    return result.text.trim()
  }
}

type SpeakerOptions = {
  voiceId?: string
  fetchImpl?: typeof fetch
  play?: (data: Uint8Array) => Promise<void>
}

export function createElevenLabsSpeaker(options?: SpeakerOptions): (text: string) => Promise<void> {
  const fetchImpl = options?.fetchImpl ?? fetch
  const play = options?.play ?? playWithSystemPlayer
  const voiceId = options?.voiceId ?? DEFAULT_VOICE_ID

  return async (text: string) => {
    logger.debug("creating speech", { preview: text.substring(0, 50) })

    // Publish to TUI so the text can be displayed
    try {
      const { GlobalBus } = await import("@/bus/global")
      const { TuiEvent } = await import("@/cli/cmd/tui/event")

      GlobalBus.emit("event", {
        directory: process.cwd(),
        payload: {
          type: TuiEvent.VoiceSpeaking.type,
          properties: { text },
        },
      })
    } catch (error) {
      logger.debug("failed to publish voice event", { error: String(error) })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      logger.error("ELEVENLABS_API_KEY not set")
      throw new Error("ELEVENLABS_API_KEY is not set")
    }

    logger.debug("calling ElevenLabs API", { voiceId })
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    })

    if (!response.ok) {
      logger.error("ElevenLabs request failed", { status: response.status, statusText: response.statusText })
      throw new Error(`ElevenLabs request failed: ${response.status} ${response.statusText}`)
    }

    logger.debug("received audio response")
    const buffer = new Uint8Array(await response.arrayBuffer())
    logger.debug("audio buffer ready", { size: buffer.length })

    logger.debug("playing audio")
    await play(buffer)
    logger.debug("audio playback completed")
  }
}

async function playWithSystemPlayer(data: Uint8Array) {
  // Try native playback first, then fall back to external tools
  logger.debug("starting playback attempt")
  const playbackMethods = [
    { name: "WebAudioAPI", fn: () => playWithWebAudioAPI(data) },
    { name: "NativeLibrary", fn: () => playWithNativeLibrary(data) },
    { name: "ExternalTools", fn: () => playWithExternalTools(data) },
  ]

  const errors: Array<{ method: string; error: any }> = []

  for (const { name, fn } of playbackMethods) {
    try {
      logger.debug("trying playback method", { method: name })
      await fn()
      logger.debug("playback succeeded", { method: name })
      return
    } catch (error) {
      errors.push({ method: name, error })
      logger.debug("playback method failed", {
        method: name,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }
  }

  const errorDetails = errors
    .map((e) => `${e.method}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
    .join("; ")
  logger.error("no supported audio playback method", { errors: errorDetails })
  throw new Error(`No supported audio playback method found. Tried: ${errorDetails}`)
}

async function playWithWebAudioAPI(data: Uint8Array) {
  // For terminal apps, we can't use browser Web Audio API
  // but we can decode MP3 and play PCM directly
  throw new Error("Web Audio API not available in terminal environment")
}

async function playWithNativeLibrary(data: Uint8Array) {
  // Try to play audio directly using Node.js streams and system audio
  // This method tries to pipe audio data directly to system audio devices
  logger.debug("platform detected", { platform: process.platform })

  if (process.platform === "darwin") {
    // On macOS, afplay doesn't support stdin, skip direct pipe
    throw new Error("macOS afplay doesn't support stdin piping")
  }

  if (process.platform === "linux") {
    // On Linux, try ALSA direct playback
    logger.debug("using Linux aplay")
    return playWithDirectPipe(data, "aplay", ["-"])
  }

  // On Windows or other platforms, fall back to external tools
  throw new Error("Native library audio not available for this platform")
}

async function playWithDirectPipe(data: Uint8Array, command: string, args: string[]) {
  // Try to pipe audio data directly to the audio player without creating temp files
  logger.debug("attempting direct pipe", { command, args: args.join(" ") })
  try {
    const proc = Bun.spawn({
      cmd: [command, ...args],
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    })

    // Write the audio data directly to stdin
    logger.debug("writing audio data to stdin", { bytes: data.length })
    proc.stdin.write(data)
    proc.stdin.end()

    const code = await proc.exited
    logger.debug("process exited", { code })
    if (code === 0) {
      return
    } else {
      throw new Error(`Direct pipe playback failed with code ${code}`)
    }
  } catch (error) {
    logger.debug("direct pipe error", { error: String(error) })
    throw new Error(`Direct pipe playback failed: ${error}`)
  }
}

async function playWithExternalTools(data: Uint8Array) {
  const tmpFile = path.join(os.tmpdir(), `opencode-voice-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`)
  logger.debug("writing audio to temp file", { tmpFile })
  await Bun.write(tmpFile, data)

  const candidates =
    process.platform === "darwin"
      ? [
          ["afplay", [tmpFile]],
          ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", tmpFile]],
          ["play", [tmpFile]],
        ]
      : [
          ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", tmpFile]],
          ["play", [tmpFile]],
          ["aplay", [tmpFile]],
        ]

  for (const [cmd, args] of candidates) {
    try {
      const argsArray = args as string[]
      logger.debug("trying external tool", { cmd, args: argsArray.join(" ") })
      const proc = Bun.spawn({
        cmd: [cmd as string, ...argsArray],
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
      const code = await proc.exited
      logger.debug("external tool exited", { cmd, code })
      if (code === 0) {
        await fs.rm(tmpFile).catch(() => {})
        logger.debug("successfully played audio")
        return
      }
    } catch (error) {
      logger.debug("external tool failed", { cmd, error: String(error) })
      // try next candidate
    }
  }

  await fs.rm(tmpFile).catch(() => {})
  throw new Error("No supported external audio player found")
}
