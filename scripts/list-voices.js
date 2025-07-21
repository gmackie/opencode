#!/usr/bin/env node

// Script to list available ElevenLabs voices
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Error: ELEVENLABS_API_KEY environment variable not set");
  process.exit(1);
}

async function listVoices() {
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log("\nAvailable ElevenLabs Voices:");
    console.log("============================\n");
    
    data.voices.forEach(voice => {
      console.log(`Name: ${voice.name}`);
      console.log(`Voice ID: ${voice.voice_id}`);
      console.log(`Category: ${voice.category || 'N/A'}`);
      if (voice.labels) {
        console.log(`Labels: ${Object.entries(voice.labels).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      console.log(`Preview URL: ${voice.preview_url || 'N/A'}`);
      console.log("---");
    });
    
    console.log(`\nTotal voices: ${data.voices.length}`);
    console.log("\nTo use a voice, add this to your opencode.json:");
    console.log('  "audio": {');
    console.log('    "voice_id": "YOUR_VOICE_ID_HERE"');
    console.log('  }');
    
  } catch (error) {
    console.error("Error fetching voices:", error.message);
    process.exit(1);
  }
}

listVoices();