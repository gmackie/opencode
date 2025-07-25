#!/usr/bin/env bun

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY environment variable not set")
  process.exit(1)
}

async function getVoices() {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  })

  if (!response.ok) {
    console.error("Failed to fetch voices:", response.statusText)
    process.exit(1)
  }

  const data = await response.json()
  return data.voices
}

const voices = await getVoices()

// Find Marcus Johnson
const marcus = voices.find((v: any) => 
  v.name.toLowerCase().includes("marcus") || 
  v.name.toLowerCase().includes("markus")
)

if (marcus) {
  console.log(`Found Marcus Johnson:`)
  console.log(`  Name: ${marcus.name}`)
  console.log(`  Voice ID: ${marcus.voice_id}`)
  console.log(`  Description: ${marcus.description || "N/A"}`)
} else {
  console.log("Marcus Johnson not found. Available voices:")
  voices.forEach((v: any) => {
    console.log(`  - ${v.name} (${v.voice_id})`)
  })
}