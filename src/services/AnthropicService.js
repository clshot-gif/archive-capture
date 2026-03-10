import Config from '../config/Config';

export async function generateTags(collectionName, researchQuestion) {
  const prompt = `You are helping a historian set up a research tagging system.

Collection: ${collectionName}
Research question: ${researchQuestion}

Generate a list of 15-20 thematic tags this researcher should use to categorize documents as she scans them in the archive. These should be specific enough to be useful for filtering later, but broad enough that many documents will match each one.

Return ONLY a JSON array of strings. No preamble, no explanation.
Example format: ["Tag one", "Tag two", "Tag three"]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Config.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: Config.ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // Parse the JSON array from the response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse tag list from API response');
  return JSON.parse(match[0]);
}
