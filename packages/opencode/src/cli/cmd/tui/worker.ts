import { Installation } from "@/installation"
import { Server } from "@/server/server"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { InstanceBootstrap } from "@/project/bootstrap"
import { Rpc } from "@/util/rpc"
import { upgrade } from "@/cli/upgrade"
import type { BunWebSocketData } from "hono/bun"

await Log.init({
  print: process.argv.includes("--print-logs"),
  dev: Installation.isLocal(),
  level: (() => {
    if (Installation.isLocal()) return "DEBUG"
    return "INFO"
  })(),
})

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

// Initialize voice feature on startup if enabled
async function initVoice() {
  const voiceLog = Log.create({ service: "voice-init" })
  try {
    voiceLog.debug("checking if voice feature is enabled")
    const apiKey = process.env.ELEVENLABS_API_KEY

    if (!apiKey) {
      voiceLog.debug("voice feature disabled - ELEVENLABS_API_KEY not set")
      return
    }

    voiceLog.info("voice feature enabled")
    const { createElevenLabsSpeaker, createVoiceSummarizer, VoiceManager } = await import("@/voice/voice")
    const { GlobalBus } = await import("@/bus/global")
    const { MessageV2 } = await import("@/session/message-v2")
    const { SessionStatus } = await import("@/session/status")

    // Create voice manager with all dependencies
    const voice = new VoiceManager({
      summarize: createVoiceSummarizer(),
      speak: createElevenLabsSpeaker(),
    })

    // Subscribe to global bus events to track all instances
    GlobalBus.on("event", async (evt) => {
      const { payload } = evt

      // Handle message updates
      if (payload.type === MessageV2.Event.Updated.type) {
        const message = payload.properties.info
        voiceLog.debug("message updated", {
          messageID: message.id,
          role: message.role,
          completed: !!message.time.completed,
        })

        if (message.role !== "assistant") return

        // Get all parts for this message
        const parts = await MessageV2.parts(message.id)
        voiceLog.debug("message parts", {
          messageID: message.id,
          partCount: parts.length,
          partTypes: parts.map((p) => p.type),
        })

        // Track text from text parts
        for (const part of parts) {
          if (part.type === "text" && !part.synthetic && !part.ignored) {
            voiceLog.debug("tracking text part", {
              messageID: message.id,
              textLength: part.text.length,
            })
            voice.onTextPart({
              messageID: message.id,
              sessionID: message.sessionID,
              text: part.text,
            })
          }

          // Detect step finish parts
          if (part.type === "step-finish") {
            voiceLog.debug("step finish detected", { messageID: message.id })
            voice.onStepFinish({
              messageID: message.id,
              sessionID: message.sessionID,
            })
          }
        }

        // Also mark as finished if message is completed
        if (message.time.completed) {
          voiceLog.debug("message completed, marking as finished", { messageID: message.id })
          voice.onStepFinish({
            messageID: message.id,
            sessionID: message.sessionID,
          })
        }
      }

      // Handle session status updates
      if (payload.type === SessionStatus.Event.Status.type) {
        voiceLog.debug("session status update", {
          status: payload.properties.status.type,
        })
        if (payload.properties.status.type === "idle") {
          voiceLog.debug("session idle, triggering voice.onIdle()")
          await voice.onIdle()
        }
      }
    })

    voiceLog.info("voice feature initialized successfully")

    // Speak initial greeting
    try {
      const speaker = createElevenLabsSpeaker()
      await speaker("Hello from opencode")
      voiceLog.debug("initial greeting spoken")
    } catch (error) {
      voiceLog.error("failed to speak greeting", { error: error instanceof Error ? error.message : String(error) })
    }
  } catch (error) {
    voiceLog.error("failed to initialize voice", { error: error instanceof Error ? error.message : String(error) })
  }
}

// Run voice initialization in the background
initVoice().catch((error) => {
  Log.Default.error("voice init error", { error: String(error) })
})

let server: Bun.Server<BunWebSocketData>
export const rpc = {
  async server(input: { port: number; hostname: string }) {
    if (server) await server.stop(true)
    try {
      server = Server.listen(input)
      return {
        url: server.url.toString(),
      }
    } catch (e) {
      console.error(e)
      throw e
    }
  },
  async checkUpgrade(input: { directory: string }) {
    await Instance.provide({
      directory: input.directory,
      init: InstanceBootstrap,
      fn: async () => {
        await upgrade().catch(() => {})
      },
    })
  },
  async shutdown() {
    Log.Default.info("worker shutting down")
    await Instance.disposeAll()
    // TODO: this should be awaited, but ws connections are
    // causing this to hang, need to revisit this
    server.stop(true)
  },
}

Rpc.listen(rpc)
