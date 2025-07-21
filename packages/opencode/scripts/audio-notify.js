#!/usr/bin/env node

const path = require('path');
const { execSync } = require('child_process');

// Get project name from current working directory
const projectName = path.basename(process.cwd());

// Get ElevenLabs API key from environment
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY environment variable not set');
  process.exit(1);
}

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
const text = `Opencode done for ${projectName}`;

async function generateAndPlayAudio() {
  try {
    console.log(`Generating audio: "${text}"`);
    
    // Call ElevenLabs API
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    // Save audio to temp file
    const buffer = await response.arrayBuffer();
    const tempFile = `/tmp/opencode-audio-${Date.now()}.mp3`;
    require('fs').writeFileSync(tempFile, Buffer.from(buffer));

    // Play audio based on platform
    const platform = process.platform;
    let playCommand;
    
    switch (platform) {
      case 'darwin': // macOS
        playCommand = `afplay "${tempFile}"`;
        break;
      case 'win32': // Windows
        playCommand = `powershell -c "(New-Object Media.SoundPlayer '${tempFile}').PlaySync()"`;
        break;
      case 'linux':
        // Try multiple Linux audio players
        const players = ['paplay', 'aplay', 'ffplay', 'mpg123'];
        for (const player of players) {
          try {
            execSync(`which ${player}`, { stdio: 'ignore' });
            playCommand = `${player} "${tempFile}"`;
            break;
          } catch {
            // Player not found, try next
          }
        }
        if (!playCommand) {
          throw new Error('No audio player found on Linux');
        }
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`Playing audio with: ${playCommand}`);
    execSync(playCommand);

    // Clean up temp file
    setTimeout(() => {
      try {
        require('fs').unlinkSync(tempFile);
      } catch (err) {
        // Ignore cleanup errors
      }
    }, 5000);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

generateAndPlayAudio();