# The Solve

A voice-first pattern-recognition tool for knowledge workers who want to use AI better.

You speak for 90 seconds about your week. The Solve surfaces 5–8 recurring patterns hiding in your work, then turns them into a sorting game against the **Crawl / Walk / Run** framework. For each pattern you classify correctly, the tool generates a copy-pasteable starter artifact — a prompt, a workflow doc, or a system sketch — tailored to your actual problem.

It teaches the framework by making you apply it. The patterns are yours, the artifacts are yours, the practice is yours.

The Solve was originally built for the *Stop Prompting, Start Solving* webinar by demand AI studio. This is the open-source version — fork it, customize it, run it on your own infrastructure.

---

## How it works

1. **Voice in** — record up to 90 seconds (or type instead). Audio goes to OpenAI Whisper for transcription.
2. **Patterns out** — the transcript goes to Claude (Haiku), which extracts 5–8 recurring patterns and classifies each against the framework.
3. **Sort game** — drag or tap each pattern into one of four buckets: Crawl, Walk, Run, or Not AI-ready.
4. **Score + unlock** — for each pattern you classify correctly, Claude generates a tier-appropriate artifact (a ready-to-paste prompt, workflow, or system sketch) tailored to that specific pattern from your week.

Nothing is stored. Recordings and transcripts are sent to OpenAI and Anthropic, processed, and discarded.

---

## Deploy your own

### Prerequisites
- A [Netlify](https://netlify.com) account (free tier works)
- An [Anthropic API key](https://console.anthropic.com/) (for pattern extraction + artifact generation)
- An [OpenAI API key](https://platform.openai.com/) (for voice transcription only — skip if you only want text input)

### Deploy in 3 steps

1. **Fork this repo** to your GitHub account.

2. **Connect to Netlify**
   - In Netlify: Add new site → Import existing project → choose your fork.
   - Netlify will auto-detect the configuration. Click Deploy.

3. **Add environment variables**
   - In Netlify dashboard → Site configuration → Environment variables:
     - `ANTHROPIC_API_KEY` — your Anthropic key
     - `OPENAI_API_KEY` — your OpenAI key
   - Trigger a redeploy.

That's it. Visit the live URL and try it.

### Local development

```bash
npm install -g netlify-cli   # one-time
git clone <your-fork>
cd tool-public/
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
echo "OPENAI_API_KEY=sk-..." >> .env.local
netlify dev
```

Open `http://localhost:8888`.

---

## File structure

```
tool-public/
├── index.html                       single-file front-end (HTML + CSS + JS)
├── netlify.toml                     functions config + redirects
├── netlify/functions/
│   ├── transcribe.js                audio → text via OpenAI Whisper
│   ├── extract-patterns.js          transcript → patterns via Claude
│   └── generate-artifacts.js        sorted patterns → artifacts via Claude
├── env.example                      env var template
└── LICENSE                          MIT
```

No build step. No framework. No npm dependencies on the front-end. Just HTML, CSS, JS, and three serverless functions.

---

## Cost

A typical session costs about **$0.04** in API fees:

| Step | Service | Approx cost |
|---|---|---|
| 90s transcription | OpenAI Whisper | $0.009 |
| Pattern extraction | Claude Haiku | $0.005 |
| Artifact generation (~5 artifacts) | Claude Haiku | $0.025 |

If you run this for a webinar with 100 attendees, expect <$5 total.

---

## Tool suggestions are suggestions

The artifacts The Solve generates may name specific tools — Claude, ChatGPT, Zapier, Make, n8n, etc. **These are examples, not prescriptions.** Any modern LLM will run the prompts. Any modern automation platform will run the workflows. Substitute what fits your stack, your budget, your constraints.

The framework matters more than the tools.

---

## Customization

Things you might want to change:

- **The framework itself.** The Crawl/Walk/Run model and AI-ready criteria live in the system prompts in `netlify/functions/extract-patterns.js` and `netlify/functions/generate-artifacts.js`. If your team uses different language for AI-readiness, edit those.
- **The model.** Default is Claude Haiku for speed and cost. Swap to Claude Sonnet in the `MODEL` constant if you want richer artifacts.
- **The recording cap.** `RECORDING_CAP_SECONDS = 90` in `index.html`. Longer means more patterns but slower transcription.
- **The styling.** `index.html` is single-file. Change the `:root` CSS variables to rebrand.

---

## License

MIT. See `LICENSE`.

---

## Credit

Built by [Christen George-McFerrin](https://www.linkedin.com/in/christengeorge) at [demand AI studio](https://demandai.studio) for the *Stop Prompting, Start Solving* webinar.

If you use The Solve with your team or community, I'd love to hear how it lands — christen@demandai.studio.
