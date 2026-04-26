// Generate first-draft AI solution artifacts for correctly-classified patterns.
// Expects: POST { patterns: [{ id, description, correctTier, userSort, reasoning }] }
// Returns: { results: [{ patternId, correct, artifact?: { title, body, test } }] }

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

const TOOL_DEFINITION = {
  name: 'generate_artifact',
  description: 'Return a copy-pasteable artifact tailored to the pattern.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '3-6 word title.' },
      body: { type: 'string', description: 'The artifact itself, copy-pasteable. Use [VARIABLE] placeholders for user-specific values.' },
      test: { type: 'string', description: 'One-line "you\'ll know it\'s working when..." check.' },
    },
    required: ['title', 'body', 'test'],
  },
};

const COMMON_RULES = `RULES:
- Use [VARIABLE] placeholders (in square brackets, ALL CAPS) for anything the user will personalize.
- Be concrete and specific. No filler. No "leverage" or "synergy."
- Match the tone of the pattern — practical, in second person where natural.
- Where a tool is named, frame it as a suggestion. Mention that any modern LLM (Claude, ChatGPT, Gemini) or automation platform (Zapier, Make, n8n) will work.
- The test line must describe a SPECIFIC observable outcome, not a vague feeling.
- Return ONLY by calling the generate_artifact tool. No prose.`;

const TIER_GUIDES = {
  'crawl': `Generate a ready-to-paste PROMPT TEMPLATE for this Crawl-tier problem.

The body should be a prompt that the user can copy into Claude / ChatGPT / Gemini and run. Structure it like:
- Opening that frames the role and task ("You are writing...")
- The variable inputs needed, with [VARIABLES] in brackets
- Format / length / tone constraints
- Optional judgment guidance for edge cases

100-250 words. Aim for "useful out of the box, with two minutes of variable swapping."`,

  'walk': `Generate a STRUCTURED WORKFLOW DOC for this Walk-tier problem.

The body should be a 3-5 step workflow the user can run weekly (or per-occurrence). Structure each step:
- Step number + name + estimated time
- What to do
- What tool/prompt assists this step
- Where human judgment is required

Total target body: 200-400 words. Be specific about sequence and judgment points — that's the value over a single prompt.`,

  'run': `Generate a SYSTEM ARCHITECTURE SKETCH for this Run-tier problem.

The body should describe a small automated system the user (or a builder they hire) could implement. Cover:
- Trigger (what kicks it off)
- Components / steps the agent or workflow runs
- Where human review or escalation kicks in
- Suggested tools (frame as suggestions, not prescriptions)

Body should be 200-400 words. Focus on the SHAPE of the system, not the code. The reader is making a build/buy/scope decision.`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, { error: 'Server not configured: ANTHROPIC_API_KEY missing' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const patterns = Array.isArray(body.patterns) ? body.patterns : null;
  if (!patterns || patterns.length === 0) {
    return jsonResponse(400, { error: 'Missing patterns array' });
  }

  // Build the result list. Patterns sorted correctly get a Claude-generated artifact;
  // patterns sorted incorrectly only get the framework reasoning back.
  const work = patterns.map(p => ({
    patternId: p.id,
    description: p.description,
    correctTier: p.correctTier,
    userSort: p.userSort,
    correct: p.userSort === p.correctTier,
    reasoning: p.reasoning,
  }));

  const correctEntries = work.filter(w => w.correct && TIER_GUIDES[w.correctTier]);

  // Generate artifacts in parallel.
  const artifactResults = await Promise.allSettled(
    correctEntries.map(entry => generateArtifact(entry))
  );

  const artifactById = {};
  artifactResults.forEach((settled, idx) => {
    const id = correctEntries[idx].patternId;
    if (settled.status === 'fulfilled' && settled.value) {
      artifactById[id] = settled.value;
    } else {
      console.error('Artifact generation failed for', id, settled.reason);
      artifactById[id] = null;
    }
  });

  const results = work.map(w => ({
    patternId: w.patternId,
    description: w.description,
    correctTier: w.correctTier,
    userSort: w.userSort,
    correct: w.correct,
    reasoning: w.reasoning,
    artifact: w.correct ? (artifactById[w.patternId] || null) : null,
  }));

  return jsonResponse(200, { results });
};

async function generateArtifact(entry) {
  const tierGuide = TIER_GUIDES[entry.correctTier];
  if (!tierGuide) return null;

  const systemPrompt = `You generate first-draft AI solution artifacts inside a webinar tool called The Mirror. The user has identified a recurring problem in their work; produce a copy-pasteable artifact that helps them start solving it today.

${tierGuide}

${COMMON_RULES}`;

  const userMessage = `Here is the pattern from the user's week:

"${entry.description}"

Tier classification: ${entry.correctTier.toUpperCase()}
Why this tier: ${entry.reasoning}

Generate the artifact for this specific pattern.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'tool', name: 'generate_artifact' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error in generateArtifact:', response.status, errText.slice(0, 500));
    return null;
  }

  const data = await response.json();
  const toolUse = (data.content || []).find(c => c.type === 'tool_use' && c.name === 'generate_artifact');
  if (!toolUse || !toolUse.input) return null;

  const { title, body, test } = toolUse.input;
  if (!title || !body || !test) return null;

  return { title, body, test };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
