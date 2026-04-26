// Transcribe audio with OpenAI Whisper.
// Expects: POST { audio: base64, mimeType: 'audio/webm' | 'audio/mp4' }
// Returns: { transcript: string }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(500, { error: 'Server not configured: OPENAI_API_KEY missing' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { audio, mimeType } = body;
  if (!audio) return jsonResponse(400, { error: 'Missing audio' });

  const audioBuffer = Buffer.from(audio, 'base64');

  // Reject obviously oversized payloads (Netlify Lambda hard limit ~6MB)
  if (audioBuffer.length > 5 * 1024 * 1024) {
    return jsonResponse(413, { error: 'Recording too large — keep it under 90 seconds.' });
  }
  if (audioBuffer.length < 1024) {
    return jsonResponse(400, { error: 'Recording too short.' });
  }

  const safeMime = (mimeType || 'audio/webm').toLowerCase();
  const ext = safeMime.includes('mp4') ? 'mp4'
            : safeMime.includes('mpeg') ? 'mp3'
            : safeMime.includes('wav') ? 'wav'
            : 'webm';

  try {
    const audioBlob = new Blob([audioBuffer], { type: safeMime });
    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API error:', response.status, errText.slice(0, 500));
      return jsonResponse(502, { error: 'Transcription service failed.' });
    }

    const data = await response.json();
    const transcript = (data.text || '').trim();

    if (!transcript) {
      return jsonResponse(422, { error: 'We couldn\'t hear anything. Try again, or type instead.' });
    }

    return jsonResponse(200, { transcript });
  } catch (err) {
    console.error('Transcribe handler error:', err);
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
