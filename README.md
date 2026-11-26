# Cali PWA Agency — Standalone Android APK

Autonomous 13-agent PWA coding studio overseen by **Cali** (Executive Director with Text Chat + Gemini Live Voice) running on **5 separate Gemini API keys** (`KEY_CALI` + `K1`–`K4`).

## Export as Android APK via GitHub Actions
1. Create a new GitHub repository and push all files from this folder to the `main` branch.
2. Open the **Actions** tab on GitHub and wait for **Build Sideloadable Android APK** to finish (~3–4 minutes).
3. Download the **`cali-pwa-agency-debug-apk`** artifact, unzip it, and sideload `app-debug.apk` onto your Android phone.

## First-Launch Setup (On-Device)
1. Tap the **Settings** icon (top right) and enter your 5 Gemini API keys (stored locally on your phone, never uploaded to Git):
   - **Cali Key (`KEY_CALI`):** Dedicated to Cali onboarding, chat, background triage, and Gemini Live voice.
   - **Worker Keys (`K1`–`K4`):** Round-robin pool for the 13 coding agents (use 4 separate Google Cloud projects for independent quotas).
2. Complete Cali's 4-step **Executive Onboarding** interview so she learns your taste, stack preferences, and approval boundaries.
3. Open the **Virtual Office** drawer to watch your 13 agents walk, code, hand off packets, and recover automatically via the smart Watchdog.
