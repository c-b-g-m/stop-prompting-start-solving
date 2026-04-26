// Extract 5-8 recurring patterns from a transcript and classify each
// against the Crawl/Walk/Run framework.
// Expects: POST { transcript: string }
// Returns: { patterns: [{ id, description, correctTier, reasoning }] }

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a pattern-recognition coach inside a webinar tool called The Mirror. The user just described their last week of work. Your job is to extract 5-8 distinct recurring patterns from their description and classify each one against the Crawl/Walk/Run framework.

THE FRAMEWORK

CRAWL — A prompt or template would solve this.
- Repetitive structure with variable details
- Single-step communication (one input, one output)
- Tasks that take 5-30 minutes today and would take seconds with a good prompt
- Examples: similar emails, reformatting content, drafting variations, summarizing one input

WALK — A multi-step workflow would solve this.
- Multi-source synthesis (information from several places combined)
- Process with judgment points along the way
- Repeatable structure but more than one step
- Examples: weekly reports pulled from multiple inputs, research synthesis, structured analysis

RUN — An automation or agent would solve this.
- Routing, classification, or triage at scale
- Always-on monitoring or filtering
- Tool integrations and data flow between systems
- Examples: form routing, lead qualification, alerting, scheduled reports

NOT AI-READY — Needs relationship, judgment, or a process fix.
- Requires authority, trust, or in-person presence
- One-time, unpredictable, or politically complex
- The underlying process is broken (AI won't fix a broken process)
- Examples: difficult conversations, hiring decisions, negotiation, fixing a misaligned team

EXTRACTION RULES

1. Find 5-8 distinct recurring patterns. If the user described fewer real recurring patterns, return what you can defend (3-5 is fine). Do NOT invent patterns to hit the count.
2. Each pattern must be a RECURRING shape, not a one-off event. "I had one meeting with X" is not a pattern. "I had similar status meetings 4 times" IS a pattern.
3. Phrase each pattern in second person, in past tense, mirroring how the user would recognize it. Example: "You wrote three different versions of the same client check-in email."
4. Each pattern gets ONE correct tier. Choose the BEST fit, not the most flattering. Be honest — many problems are CRAWL-tier even when the user feels they should be Run-tier.
5. The reasoning must reference the framework's criteria concretely (e.g., "Multi-source synthesis with judgment — Walk fits.").
6. IDs are 'p1', 'p2', 'p3', etc. in order.
7. If a pattern is genuinely outside the framework (relationship, authority, broken process), classify as not-ai. Don't force AI fit.

Return your output by calling the extract_patterns tool. Do not include any prose response.`;

const TOOL_DEFINITION = {
  name: 'extract_patterns',
  description: 'Return 5-8 recurring patterns extracted from the user\'s week, each classified against the Crawl/Walk/Run framework.',
  input_schema: {
    type: 'object',
    properties: {
      patterns: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Sequential id like "p1", "p2".',
            },
            description: {
              type: 'string',
              description: 'One sentence in second person past tense, recognizable to the user.',
            },
            correctTier: {
              type: 'string',
              enum: ['crawl', 'walk', 'run', 'not-ai'],
              description: 'The tier that best fits this pattern under the framework.',
            },
            reasoning: {
              type: 'string',
              description: 'One sentence framework-grounded justification.',
            },
          },
          required: ['id', 'description', 'correctTier', 'reasoning'],
        },
      },
    },
    required: ['patterns'],
  },
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

  const transcript = (body.transcript || '').trim();
  if (transcript.length < 60) {
    return jsonResponse(400, { error: 'Transcript too short — try describing your week in more detail.' });
  }
  if (transcript.length > 12000) {
    return jsonResponse(413, { error: 'Transcript too long. Keep it to about 90 seconds of speech.' });
  }

  try {
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: 'extract_patterns' },
        messages: [{
          role: 'user',
          content: `Here is what I did last week:\n\n${transcript}`,
        }],
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('Anthropic API error:', apiResponse.status, errText.slice(0, 500));
      return jsonResponse(502, { error: 'Pattern extraction service failed.' });
    }

    const data = await apiResponse.json();
    const toolUse = (data.content || []).find(c => c.type === 'tool_use' && c.name === 'extract_patterns');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.patterns)) {
      console.error('Missing tool_use in response:', JSON.stringify(data).slice(0, 1000));
      return jsonResponse(502, { error: 'Could not extract patterns from response.' });
    }

    const patterns = toolUse.input.patterns
      .filter(p => p && p.id && p.description && p.correctTier && p.reasoning)
      .filter(p => ['crawl', 'walk', 'run', 'not-ai'].includes(p.correctTier))
      .slice(0, 8);

    if (patterns.length < 3) {
      return jsonResponse(422, { error: "We couldn't find enough recurring patterns. Try giving more detail about what you did multiple times." });
    }

    return jsonResponse(200, { patterns });
  } catch (err) {
    console.error('Extract handler error:', err);
    return jsonResponse(500, { error: 'Unexpected server error.' });
  }
};

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
