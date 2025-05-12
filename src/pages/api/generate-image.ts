import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { mealName } = req.body;

  if (!mealName) {
    return res.status(400).json({ error: 'Meal name is required' });
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Create a fantasy-style illustration of "${mealName}" as if it were art for a Magic: The Gathering card. The style should be painterly and mystical, with dramatic lighting and a magical atmosphere. The food should look appetizing but with a fantastical twist.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });

    if (!response.data?.[0]?.url) {
      throw new Error('No image URL in response');
    }

    return res.status(200).json({ imageUrl: response.data[0].url });
  } catch (error: any) {
    console.error('Error generating image:', error);
    return res.status(500).json({ error: 'Failed to generate image' });
  }
} 