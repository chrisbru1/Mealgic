import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

interface Meal {
  meal: string;
  ingredients: string[];
  link: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any extra whitespace
  return response.replace(/```json\n?|\n?```/g, '').trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Meal | { error: string }>
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
          content: 'You are a JSON generator that only returns valid JSON. Return a single meal object with exactly these properties: "meal" (string), "ingredients" (array of strings), and "link" (string). Do not include any markdown formatting or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const llmResponse = completion.choices[0]?.message?.content;

    if (!llmResponse) {
      return res.status(500).json({ error: 'Failed to generate replacement meal' });
    }

    try {
      const cleanedResponse = cleanJsonResponse(llmResponse);
      let mealData = JSON.parse(cleanedResponse);
      
      // If the response is an array with one item, take the first item
      if (Array.isArray(mealData)) {
        mealData = mealData[0];
      }

      // Validate the meal object structure
      if (!mealData.meal || !Array.isArray(mealData.ingredients) || !mealData.link) {
        throw new Error('Invalid meal data structure');
      }

      return res.status(200).json(mealData);
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', e);
      console.error('Raw response:', llmResponse);
      return res.status(500).json({ error: 'Failed to parse replacement meal response' });
    }
  } catch (error: any) {
    console.error('Error generating replacement meal:', error);
    return res.status(500).json({ error: 'Failed to generate replacement meal' });
  }
}