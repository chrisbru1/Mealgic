// src/pages/api/generate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

interface Meal {
  meal: string;
  ingredients: string[];
  link: string;
  description: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any extra whitespace
  return response.replace(/```json\n?|\n?```/g, '').trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Meal[] | { error: string, details?: string | object }>
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
    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is not configured');
      return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

    // Add validation for API key format
    if (!process.env.OPENAI_API_KEY.startsWith('sk-') || process.env.OPENAI_API_KEY.length < 40) {
      console.error('OpenAI API key appears to be in incorrect format');
      return res.status(500).json({ error: 'OpenAI API key appears to be invalid' });
    }

    console.log('API key validation passed, attempting OpenAI request...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a recipe generator that adds fantasy-themed descriptions to real recipes. Return a JSON array where each item has these properties:\n' +
            '- "meal" (string): Use the actual name of a real, well-known recipe\n' +
            '- "ingredients" (array of strings): List the real, specific ingredients needed for the recipe with approximate quantities\n' +
            '- "link" (string): Provide a link to a reputable recipe website (like allrecipes.com, foodnetwork.com, epicurious.com, seriouseats.com) for the actual recipe\n' +
            '- "description" (string): Create a fantasy-themed description (50-150 characters) that reimagines the real dish as if it were served in a magical tavern. Include magical effects or fantasy elements while keeping the actual dish recognizable.\n\n' +
            'Focus on providing accurate, real-world recipes that people can actually cook, while only adding fantasy elements to the description.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const llmResponse = completion.choices[0]?.message?.content;

    if (!llmResponse) {
      console.error('No response content from OpenAI');
      return res.status(500).json({ error: 'No response from meal plan generation' });
    }

    try {
      const cleanedResponse = cleanJsonResponse(llmResponse);
      console.log('Cleaned response:', cleanedResponse);
      let mealData: Meal[];
      
      try {
        const parsedData = JSON.parse(cleanedResponse);
        // Handle both array and object responses
        mealData = Array.isArray(parsedData) ? parsedData : parsedData.meals || [parsedData];
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw response:', llmResponse);
        throw new Error('Failed to parse JSON response');
      }

      // Validate it's an array
      if (!Array.isArray(mealData)) {
        console.error('Response is not an array:', mealData);
        throw new Error('Response is not an array');
      }

      // Validate each meal object
      for (const meal of mealData) {
        if (!meal.meal || !Array.isArray(meal.ingredients) || !meal.link || !meal.description) {
          console.error('Invalid meal object:', meal);
          throw new Error('Invalid meal object structure');
        }
        
        // Validate description length with more flexible limits
        if (meal.description.length < 50 || meal.description.length > 150) {
          console.error('Invalid description length:', meal.description.length);
          // If description is too long or too short, truncate or pad it instead of throwing an error
          if (meal.description.length > 150) {
            meal.description = meal.description.substring(0, 147) + '...';
          } else if (meal.description.length < 50) {
            meal.description = meal.description + ' ' + 'A truly magical dish fit for any adventurer.'.substring(0, 50 - meal.description.length);
          }
        }
      }

      return res.status(200).json(mealData);
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', e);
      console.error('Raw response:', llmResponse);
      return res.status(500).json({ error: 'Failed to parse meal plan response: ' + (e as Error).message });
    }
  } catch (error: any) {
    console.error('Error generating meal plan:', error);
    return res.status(500).json({ 
      error: 'Failed to generate meal plan: ' + (error.message || 'Unknown error'),
      details: error.response?.data || error.message || 'No additional details available'
    });
  }
}