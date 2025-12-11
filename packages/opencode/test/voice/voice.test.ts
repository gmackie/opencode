import { describe, expect, test } from "bun:test"
import { VoiceManager, createElevenLabsSpeaker } from "@/voice/voice"
import { MessageV2 } from "@/session/message-v2"

function textPart(input: { messageID: string; sessionID: string; text: string }) {
  return {
    id: `${input.messageID}-text`,
    type: "text",
    sessionID: input.sessionID,
    messageID: input.messageID,
    text: input.text,
  }
}

function stepFinishPart(input: { messageID: string; sessionID: string }): MessageV2.StepFinishPart {
  return {
    id: `${input.messageID}-finish`,
    type: "step-finish",
    messageID: input.messageID,
    sessionID: input.sessionID,
    reason: "complete",
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  }
}

describe("VoiceManager", () => {
  test("summarizes the last assistant message on idle", async () => {
    const summarizeCalls: Array<{ text: string; providerID?: string; modelID?: string; sessionID?: string }> = []
    const spoken: string[] = []
    const voice = new VoiceManager({
      summarize: async (input) => {
        summarizeCalls.push(input)
        return "Added the fields."
      },
      speak: async (text) => {
        spoken.push(text)
      },
    })

    voice.onTextPart(textPart({ messageID: "m1", sessionID: "s1", text: "Added field A" }))
    voice.onTextPart(textPart({ messageID: "m1", sessionID: "s1", text: " and field B" }))
    voice.onStepFinish(stepFinishPart({ messageID: "m1", sessionID: "s1" }))

    await voice.onIdle()

    expect(summarizeCalls).toHaveLength(1)
    expect(summarizeCalls[0].text).toBe("Added field A and field B")
    expect(summarizeCalls[0].sessionID).toBe("s1")
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toBe("Added the fields.")
  })
})

describe("createElevenLabsSpeaker", () => {
  test("sends an ElevenLabs request with the API key and voice id", async () => {
    const requests: any[] = []
    const played: Uint8Array[] = []
    const speaker = createElevenLabsSpeaker({
      voiceId: "voice-123",
      fetchImpl: Object.assign(
        (url: RequestInfo | URL, init?: RequestInit) => {
          requests.push({ url, init })
          return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
        },
        { preconnect: () => {} },
      ) as typeof fetch,
      play: async (data) => {
        played.push(data)
      },
    })

    process.env.ELEVENLABS_API_KEY = "test-key"
    await speaker("Hello world")

    expect(requests).toHaveLength(1)
    expect(requests[0].url.toString()).toContain("voice-123")
    expect(requests[0].init?.headers && (requests[0].init.headers as any)["xi-api-key"]).toBe("test-key")
    expect(played[0]).toBeInstanceOf(Uint8Array)
    expect(played[0].byteLength).toBeGreaterThan(0)
  })
})
