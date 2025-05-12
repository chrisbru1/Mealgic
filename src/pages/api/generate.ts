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

const VALID_RECIPE_DOMAINS = [
  'allrecipes.com',
  'foodnetwork.com',
  'epicurious.com',
  'seriouseats.com',
  'simplyrecipes.com',
  'food.com',
  'cooking.nytimes.com',
  'bonappetit.com',
  'tasty.co',
  'delish.com',
  'tasteofhome.com',
  'cookinglight.com',
  'bettycrocker.com',
  'myrecipes.com',
  'yummly.com'
];

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any extra whitespace
  return response.replace(/```json\n?|\n?```/g, '').trim();
}

function isValidRecipeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return VALID_RECIPE_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function getSearchUrl(domain: string, searchQuery: string): string {
  const encodedQuery = encodeURIComponent(searchQuery.trim());
  switch (domain) {
    case 'allrecipes.com':
      return `https://www.allrecipes.com/search?q=${encodedQuery}`;
    case 'foodnetwork.com':
      return `https://www.foodnetwork.com/search/${encodedQuery}-`;
    case 'epicurious.com':
      return `https://www.epicurious.com/search/${encodedQuery}`;
    case 'seriouseats.com':
      return `https://www.seriouseats.com/search?q=${encodedQuery}`;
    case 'simplyrecipes.com':
      return `https://www.simplyrecipes.com/search?q=${encodedQuery}`;
    case 'food.com':
      return `https://www.food.com/search/${encodedQuery}`;
    case 'bonappetit.com':
      return `https://www.bonappetit.com/search?q=${encodedQuery}`;
    case 'tasty.co':
      return `https://tasty.co/search?q=${encodedQuery}`;
    case 'delish.com':
      return `https://www.delish.com/search?q=${encodedQuery}`;
    case 'tasteofhome.com':
      return `https://www.tasteofhome.com/search/?q=${encodedQuery}`;
    case 'cookinglight.com':
      return `https://www.cookinglight.com/search?q=${encodedQuery}`;
    case 'bettycrocker.com':
      return `https://www.bettycrocker.com/search?term=${encodedQuery}`;
    case 'myrecipes.com':
      return `https://www.myrecipes.com/search?q=${encodedQuery}`;
    case 'yummly.com':
      return `https://www.yummly.com/recipes?q=${encodedQuery}`;
    default:
      return `https://www.allrecipes.com/search?q=${encodedQuery}`;
  }
}

function fixUrl(url: string): string {
  if (!url) {
    return 'https://www.allrecipes.com';
  }
  
  // Add https:// if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Extract the domain and search terms
    const domain = VALID_RECIPE_DOMAINS.find(d => parsedUrl.hostname.endsWith(d));
    if (!domain) {
      // If not a valid recipe domain, search on allrecipes
      const searchQuery = url.replace(/https?:\/\//, '').replace(/[^\w\s]/g, ' ');
      return getSearchUrl('allrecipes.com', searchQuery);
    }
    
    // Extract search terms from the URL path
    const searchTerms = parsedUrl.pathname
      .split('/')
      .filter(part => part.length > 0 && !['search', 'recipes'].includes(part))
      .join(' ')
      .replace(/-|_/g, ' ');
    
    // Always convert to a search URL unless it's already a search URL
    if (!parsedUrl.pathname.includes('/search')) {
      return getSearchUrl(domain, searchTerms || parsedUrl.hostname.split('.')[0]);
    }
    
    return url;
  } catch {
    // If completely invalid, search on allrecipes
    const searchQuery = url.replace(/https?:\/\//, '').replace(/[^\w\s]/g, ' ');
    return getSearchUrl('allrecipes.com', searchQuery);
  }
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
            '- "link" (string): IMPORTANT: Only provide URLs to EXISTING recipes that you are certain exist. Do not construct or guess URLs. Instead of guessing, use the search URL format for the chosen site, for example:\n' +
            '  * allrecipes.com: https://www.allrecipes.com/search?q=recipe+name\n' +
            '  * foodnetwork.com: https://www.foodnetwork.com/search/recipe+name-\n' +
            '  * simplyrecipes.com: https://www.simplyrecipes.com/search?q=recipe+name\n' +
            '  * seriouseats.com: https://www.seriouseats.com/search?q=recipe+name\n' +
            '  * epicurious.com: https://www.epicurious.com/search/recipe+name\n' +
            'Always use the search URL format unless you are 100% certain of the exact, complete URL to an existing recipe.\n' +
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
        
        // Fix and validate the link
        meal.link = fixUrl(meal.link);
        
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