// src/pages/api/generate.ts
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
  res: NextApiResponse<Meal[] | { error: string }>
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
          content: 'You are a JSON generator that only returns valid JSON arrays. Each array item should be a meal object with exactly these properties: "meal" (string), "ingredients" (array of strings), and "link" (string). Do not include any markdown formatting or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const llmResponse = completion.choices[0]?.message?.content;

    if (!llmResponse) {
      return res.status(500).json({ error: 'Failed to generate meal plan' });
    }

    try {
      const cleanedResponse = cleanJsonResponse(llmResponse);
      const mealData = JSON.parse(cleanedResponse) as Meal[];

      // Validate it's an array
      if (!Array.isArray(mealData)) {
        throw new Error('Response is not an array');
      }

      // Validate each meal object
      for (const meal of mealData) {
        if (!meal.meal || !Array.isArray(meal.ingredients) || !meal.link) {
          throw new Error('Invalid meal object structure');
        }
      }

      return res.status(200).json(mealData);
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', e);
      console.error('Raw response:', llmResponse);
      return res.status(500).json({ error: 'Failed to parse meal plan response' });
    }
  } catch (error: any) {
    console.error('Error generating meal plan:', error);
    return res.status(500).json({ error: 'Failed to generate meal plan' });
  }
}