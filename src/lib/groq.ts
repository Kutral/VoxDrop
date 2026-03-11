import Groq from "groq-sdk";

export async function transcribeAudio(
  base64Audio: string,
  apiKey: string,
  model: string = "whisper-large-v3-turbo"
): Promise<string> {
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  // Convert base64 to File object
  const byteCharacters = atob(base64Audio);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "audio/wav" });
  const file = new File([blob], "audio.wav", { type: "audio/wav" });

  const transcription = await groq.audio.transcriptions.create({
    file: file,
    model: model,
    response_format: "text",
    language: "en",
  });

  return transcription as unknown as string; // GROQ returns raw string when response_format="text"
}

export async function cleanupText(
  rawText: string,
  apiKey: string,
  model: string = "llama-3.1-8b-instant"
): Promise<string> {
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = `You are a DICTATION TEXT FORMATTER. You are NOT a chatbot. You are NOT an assistant. You do NOT answer questions. You do NOT have conversations.

Your ONLY job: Take the raw transcribed speech below and return a cleaned-up version of THE EXACT SAME TEXT the speaker said.

STRICT RULES:
1. NEVER reply to or answer the content. If the speaker says "Hey is it working?" you output "Hey, is it working?" — you do NOT respond with an answer.
2. NEVER add your own words, opinions, greetings, or explanations. Output ONLY what the speaker said.
3. Remove filler words: um, uh, like, you know, basically, actually, literally, so, I mean — unless grammatically essential.
4. Add proper punctuation (commas, periods, question marks) and capitalize sentence starts.
5. If the speaker corrects themselves (e.g. "meet at 2 actually 3"), output only the corrected version ("meet at 3").
6. If numbered items are spoken, format as a numbered list.
7. Preserve the speaker's exact meaning, tone, and intent.

CRITICAL: Your output must contain ONLY the cleaned version of what was spoken. Nothing else. No preamble. No explanation. No "Here's the cleaned text:". Just the cleaned text itself.`;

  // Cap output tokens to prevent the model from generating content
  const inputWordCount = rawText.split(/\s+/).length;
  const maxOutputTokens = Math.max(64, Math.min(inputWordCount * 3, 512));

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `[DICTATION TO CLEAN]: ${rawText}` },
    ],
    model: model,
    temperature: 0,
    max_tokens: maxOutputTokens,
  });

  return chatCompletion.choices[0]?.message?.content || rawText;
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    // Attempt a basic cheap completion
    await groq.chat.completions.create({
      messages: [{ role: "user", content: "test" }],
      model: "llama-3.1-8b-instant",
      max_tokens: 1,
    });
    return true;
  } catch (err) {
    return false;
  }
}
