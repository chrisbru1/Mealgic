import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ imageUrl: string } | { error: string, details?: string | object }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { mealName } = req.body;

  if (!mealName) {
    return res.status(400).json({ error: 'Meal name is required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API key is not configured');
    return res.status(500).json({ error: 'OpenAI API key is not configured' });
  }

  try {
    console.log(`Attempting to generate image for meal: ${mealName}`);
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Create a fantasy-style illustration of "${mealName}" in the style of Magic: The Gathering card art. Make it mystical and appetizing.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });

    if (!response.data?.[0]?.url) {
      console.error('No image URL in response:', response);
      throw new Error('No image URL in response');
    }

    console.log(`Successfully generated image for meal: ${mealName}`);
    return res.status(200).json({ imageUrl: response.data[0].url });
  } catch (error: any) {
    console.error(`Error generating image for meal "${mealName}":`, error);
    
    // Check for rate limiting
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded for image generation',
        details: 'Too many requests. Please try again in a few moments.'
      });
    }

    // Check for content policy violations
    if (error.status === 400 && error.response?.data?.error?.code === 'content_policy_violation') {
      return res.status(400).json({ 
        error: 'Content policy violation',
        details: 'The image request violated content policies. Please try a different meal name.'
      });
    }

    return res.status(500).json({ 
      error: 'Failed to generate image: ' + (error.message || 'Unknown error'),
      details: error.response?.data || error.message || 'No additional details available'
    });
  }
} 