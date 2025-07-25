import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Config } from "../config/config"
import { Persona } from "./persona"

const execAsync = promisify(exec)

export namespace ElevenLabs {
  const log = Log.create({ service: "audio.elevenlabs" })

  const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"
  const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM" // Rachel voice (default)

  export async function speak(text: string): Promise<void> {
    try {
      const cfg = await Config.get()

      // Check if audio is enabled
      if (!cfg.audio?.enabled) {
        log.debug("Audio notifications disabled")
        return
      }

      const apiKey = cfg.audio?.elevenlabs_api_key || process.env["ELEVENLABS_API_KEY"]
      if (!apiKey) {
        log.warn("ElevenLabs API key not configured")
        return
      }

      // Get the voice ID from config or use default
      const voiceId = cfg.audio?.voice_id || DEFAULT_VOICE_ID

      log.info("Generating speech", { text, voiceId })

      // Create temp file for audio
      const tempDir = os.tmpdir()
      const audioFile = path.join(tempDir, `opencode-audio-${Date.now()}.mp3`)

      // Call ElevenLabs API
      const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`)
      }

      // Save audio to file
      const buffer = await response.arrayBuffer()
      await fs.writeFile(audioFile, Buffer.from(buffer))

      // Play audio based on platform
      await playAudio(audioFile)

      // Clean up temp file after a delay
      setTimeout(async () => {
        try {
          await fs.unlink(audioFile)
        } catch (err) {
          // Ignore cleanup errors
        }
      }, 5000)
    } catch (error) {
      log.error("Failed to speak", { error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function playAudio(filePath: string): Promise<void> {
    const platform = process.platform
    let command: string = ""

    switch (platform) {
      case "darwin": // macOS
        command = `afplay "${filePath}"`
        break
      case "win32": // Windows
        command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`
        break
      case "linux":
        // Try multiple Linux audio players in order of preference
        const players = ["paplay", "aplay", "ffplay", "mpg123"]
        for (const player of players) {
          try {
            await execAsync(`which ${player}`)
            command = `${player} "${filePath}"`
            break
          } catch {
            // Player not found, try next
          }
        }
        if (!command) {
          throw new Error("No audio player found on Linux")
        }
        break
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    log.debug("Playing audio", { command })
    await execAsync(command)
  }

  export async function saySessionComplete(projectName: string, sessionID: string): Promise<void> {
    const cfg = await Config.get()

    // Get the context summary and transform it using persona
    const context = await Persona.summarizeContext(sessionID)
    const personaMessage = await Persona.transformToPersona(context, projectName, cfg.audio?.persona)

    await speak(personaMessage)
  }
}
