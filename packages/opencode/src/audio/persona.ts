import { generateText, wrapLanguageModel } from "ai"
import { Log } from "../util/log"
import { Provider } from "../provider/provider"
import { ProviderTransform } from "../provider/transform"
import { Session } from "../session"

export namespace Persona {
  const log = Log.create({ service: "audio.persona" })

  // Example persona styles:
  // - Professional: "You are a professional software engineer providing concise status updates."
  // - Enthusiastic: "You are an enthusiastic coding buddy who celebrates every accomplishment!"
  // - Minimalist: "You provide ultra-brief, essential information only."
  // - British Butler: "You are a refined British butler announcing the completion of tasks with dignity."
  export interface PersonaConfig {
    enabled: boolean
    style?: string
    examples?: string[]
  }

  const DEFAULT_PERSONA = `You are a friendly AI coding assistant with a warm, conversational tone. 
When OpenCode finishes a task, transform the technical summary into a natural, brief spoken announcement 
that sounds like a helpful colleague letting someone know their work is done. Be encouraging and specific 
about what was accomplished.`

  export async function transformToPersona(
    technicalMessage: string,
    projectName: string,
    personaConfig?: PersonaConfig,
  ): Promise<string> {
    try {
      log.debug("Transforming to persona", {
        technicalMessage: technicalMessage.substring(0, 200),
        projectName,
        personaEnabled: personaConfig?.enabled,
      })
      // If persona transformation is disabled, return a simple message
      if (!personaConfig?.enabled) {
        log.debug("Persona transformation disabled, using default message")
        return `OpenCode complete for ${projectName}`
      }

      // Get the configured model and provider
      const providerID = "anthropic"
      const modelID = "claude-3-haiku-20240307"

      const model = await Provider.getModel(providerID, modelID)

      if (!model) {
        log.warn("No model available for persona transformation", { providerID, modelID, technicalMessage })
        return `OpenCode complete for ${projectName}`
      }

      const personaPrompt = personaConfig.style || DEFAULT_PERSONA
      const examples = personaConfig.examples?.join("\n") || ""

      const prompt = `${personaPrompt}

${examples ? `Examples of your style:\n${examples}\n` : ""}

Technical context: ${technicalMessage}
Project: ${projectName}

Transform this into a brief, natural spoken announcement (1-2 sentences max) that indicates OpenCode has finished and is ready for input.`

      const result = await generateText({
        model: wrapLanguageModel({
          model: model.language,
          middleware: [
            {
              async transformParams(args) {
                if (args.type === "generate") {
                  // @ts-expect-error
                  args.params.prompt = ProviderTransform.message(args.params.prompt, providerID, modelID)
                }
                return args.params
              },
            },
          ],
        }),
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        maxRetries: 0,
        temperature: 0.7,
      })

      return result.text.trim()
    } catch (error) {
      log.error("Failed to transform to persona", {
        error: error instanceof Error ? error.message : String(error),
      })
      return `OpenCode complete for ${projectName}`
    }
  }

  export async function summarizeContext(sessionID: string): Promise<string> {
    try {
      const messages = await Session.messages(sessionID)
      log.debug("Summarizing context", { sessionID, messageCount: messages.length })
      if (messages.length === 0) {
        log.debug("No messages found for session", { sessionID })
        return "No actions were performed"
      }

      // Get the last few messages to understand context
      const recentMessages = messages.slice(-5)

      // Find the last user request
      let lastUserRequest = ""
      for (let i = recentMessages.length - 1; i >= 0; i--) {
        if (recentMessages[i].info.role === "user") {
          const textParts = recentMessages[i].parts.filter((p) => p.type === "text").map((p) => p.text)
          lastUserRequest = textParts.join(" ").trim()
          break
        }
      }

      // Get assistant's actions from the last message
      const lastAssistant = messages[messages.length - 1]
      log.debug("Last message info", {
        role: lastAssistant.info.role,
        partsCount: lastAssistant.parts.length,
        sessionID,
      })
      if (lastAssistant.info.role !== "assistant") {
        log.debug("Last message is not from assistant", { role: lastAssistant.info.role, sessionID })
        return lastUserRequest ? `Processed your request: ${lastUserRequest}` : "Session ended"
      }

      // Extract tool uses and text from assistant message
      const toolParts = lastAssistant.parts.filter((p) => p.type === "tool")
      const textParts = lastAssistant.parts.filter((p) => p.type === "text" && "text" in p).map((p) => p.text)
      log.debug("Assistant message parts", {
        toolPartsCount: toolParts.length,
        textPartsCount: textParts.length,
        textPreview: textParts.slice(0, 2).map((t) => t.substring(0, 100)),
        sessionID,
      })

      // Build a summary of what was done
      const actions = []

      for (const tool of toolParts) {
        if (tool.state.status === "completed" && "tool" in tool) {
          switch (tool.tool) {
            case "edit":
            case "multiedit":
              actions.push("edited files")
              break
            case "write":
              actions.push("created files")
              break
            case "read":
              actions.push("read files")
              break
            case "grep":
            case "glob":
              actions.push("searched the codebase")
              break
            case "bash":
              actions.push("ran commands")
              break
            case "todowrite":
              actions.push("updated tasks")
              break
          }
        }
      }

      // Get the last text response if meaningful
      const lastText = textParts[textParts.length - 1]?.trim() || ""

      if (actions.length > 0) {
        const uniqueActions = [...new Set(actions)]
        const summary = `I ${uniqueActions.join(", ")}`
        if (lastUserRequest) {
          return `${summary} for: ${lastUserRequest.substring(0, 100)}`
        }
        return summary
      }

      if (lastText && lastText.length > 10) {
        return lastText.substring(0, 200)
      }

      if (lastUserRequest) {
        return `Completed: ${lastUserRequest.substring(0, 100)}`
      }

      return "Task completed"
    } catch (error) {
      log.error("Failed to summarize context", {
        error: error instanceof Error ? error.message : String(error),
        sessionID,
      })
      return "Processing complete"
    }
  }
}
