import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any extra whitespace
  return response.replace(/```json\n?|\n?```/g, '').trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ [key: string]: string[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is missing.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a JSON generator that only returns valid JSON objects. Return a categorized grocery list as a JSON object where keys are store sections and values are arrays of strings. Do not include any markdown formatting or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const llmResponse = completion.choices[0]?.message?.content;

    if (!llmResponse) {
      return res.status(500).json({ error: 'Failed to generate grocery list' });
    }

    try {
      const cleanedResponse = cleanJsonResponse(llmResponse);
      const categorizedList = JSON.parse(cleanedResponse) as { [key: string]: string[] };
      
      // Validate the response structure
      if (typeof categorizedList !== 'object' || Array.isArray(categorizedList)) {
        throw new Error('Invalid grocery list structure');
      }

      // Ensure all values are string arrays
      for (const [key, value] of Object.entries(categorizedList)) {
        if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
          throw new Error('Invalid grocery list item structure');
        }
      }

      return res.status(200).json(categorizedList);
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', e);
      console.error('Raw response:', llmResponse);
      return res.status(500).json({ error: 'Failed to parse grocery list response' });
    }
  } catch (error: any) {
    console.error('Error generating grocery list:', error);
    return res.status(500).json({ error: 'Failed to generate grocery list' });
  }
}