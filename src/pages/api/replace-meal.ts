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

function isValidRecipeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return VALID_RECIPE_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any extra whitespace
  return response.replace(/```json\n?|\n?```/g, '').trim();
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
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
          content: 'You are a recipe generator that adds fantasy-themed descriptions to real recipes. Return a JSON object with these properties:\n' +
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
      if (!mealData.meal || !Array.isArray(mealData.ingredients) || !mealData.link || !mealData.description) {
        throw new Error('Invalid meal data structure');
      }

      // Fix and validate the link
      mealData.link = fixUrl(mealData.link);

      // Validate description length with more flexible limits
      if (mealData.description.length < 50 || mealData.description.length > 150) {
        if (mealData.description.length > 150) {
          mealData.description = mealData.description.substring(0, 147) + '...';
        } else if (mealData.description.length < 50) {
          mealData.description = mealData.description + ' ' + 'A truly magical dish fit for any adventurer.'.substring(0, 50 - mealData.description.length);
        }
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