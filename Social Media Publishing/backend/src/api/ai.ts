import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { AIService } from '../services/ai';

export const aiRouter = new Hono<HonoEnv>();

aiRouter.post('/generate', async (c) => {
  const { prompt, platforms, audience, tone, goal, keywords, length } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Topic/Prompt is required' }, 400);
  }

  try {
    const aiService = new AIService(c.env);
    
    if (platforms && Array.isArray(platforms) && platforms.length > 0) {
      const params = {
        topic: prompt,
        platforms,
        audience,
        tone,
        goal,
        keywords,
        length
      };
      const results = await aiService.generatePlatformSpecificContent(params);
      return c.json({ results });
    }

    const result = await aiService.generateCaption(prompt, 'general social media');
    return c.json({ result });
  } catch (error: any) {
    console.error("Cloudflare AI Error [generate]:", error.message || error);
    return c.json({ error: error.message || 'Failed to generate content' }, 500);
  }
});

aiRouter.post('/edit', async (c) => {
  const { content, platform, action } = await c.req.json();
  if (!content || !platform || !action) {
    return c.json({ error: 'Content, platform, and action are required' }, 400);
  }
  
  try {
    const aiService = new AIService(c.env);
    const result = await aiService.editContent(content, platform, action);
    return c.json({ result });
  } catch (error: any) {
    console.error("Cloudflare AI Error [edit]:", error.message || error);
    return c.json({ error: error.message || 'Failed to edit content' }, 500);
  }
});

aiRouter.post('/hashtags', async (c) => {
  const { content } = await c.req.json();

  if (!content) {
    return c.json({ error: 'Content is required' }, 400);
  }

  try {
    const aiService = new AIService(c.env);
    const result = await aiService.generateHashtags(content);
    return c.json({ result });
  } catch (error: any) {
    console.error("Cloudflare AI Error:", error.message || error);
    return c.json({ error: error.message || 'Failed to generate hashtags' }, 500);
  }
});
