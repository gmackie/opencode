import { cmd } from "./cmd"

import { bootstrap } from "../bootstrap"
import { Session } from "../../session"

export const UsageCommand = cmd({
  command: "usage",
  describe: "Show usage summary",
  handler: async () => {
    await bootstrap({ cwd: process.cwd() }, async () => {
      let total = 0
      for await (const session of Session.list()) {
        const msgs = await Session.messages(session.id)
        for (const msg of msgs) {
          if (msg.info.role === "assistant") total += msg.info.cost
        }
      }
      console.log("Total cost: $" + total.toFixed(4))
    })
  },
})
