export class AIService {
  private env: any;

  constructor(env: any) {
    this.env = env;
  }

  private async runAIModel(systemPrompt: string, userPrompt: string): Promise<string> {
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = this.env.AI_API_TOKEN || this.env.CLOUDFLARE_API_TOKEN;

    const payload = {
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    if (accountId && apiToken) {
      console.log("Using REST API for AI Generation");
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3-8b-instruct`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`AI API HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const result = await response.json() as any;
        if (result.success === false) {
          throw new Error(`AI API returned failure: ${JSON.stringify(result.errors)}`);
        }
        return result.result.response;
      } catch (err: any) {
        console.error("AI REST API failed:", err.message);
        return this.getMockResponse(systemPrompt, userPrompt);
      }
    } else {
      console.log("Falling back to native AI binding (env.AI)");
      if (!this.env.AI) {
        console.warn("No AI Binding found. Using mock response.");
        return this.getMockResponse(systemPrompt, userPrompt);
      }
      
      try {
        const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', payload);
        return response.response;
      } catch (err: any) {
        if (err.message.includes("Not logged in")) {
          console.error("❌ CLOUDFLARE AUTH ERROR: You are not logged into Wrangler.");
          console.error("👉 Run 'npx wrangler login' to use the real AI.");
          console.log("🔄 Falling back to Mock Response for local development.");
          return this.getMockResponse(systemPrompt, userPrompt);
        }
        throw err;
      }
    }
  }

  private getMockResponse(systemPrompt: string, userPrompt: string): string {
    const isJsonRequest = systemPrompt.includes("STRICT JSON RESPONSE");
    const isHashtagRequest = systemPrompt.includes("3 highly relevant");
    const lowerPrompt = userPrompt.toLowerCase();
    
    // Clean up user prompt for injection
    const safeTopic = userPrompt.replace(/"/g, "'").substring(0, 80);

    if (isHashtagRequest) {
      const words = safeTopic.split(' ').filter(w => w.length > 3).slice(0, 3);
      if (words.length > 0) {
        return words.map(w => '#' + w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return "#Trending #Update #Highlight";
    }

    if (isJsonRequest) {
      // Very basic keyword detection to vary the templates
      const isAchievement = lowerPrompt.match(/star performer|award|won|achieve|proud|certificate/);
      const isEvent = lowerPrompt.match(/event|conference|meetup|attending/);
      const isProduct = lowerPrompt.match(/launch|product|feature|release|new/);

      if (isAchievement) {
        return JSON.stringify({
          linkedin: `🏆 I'm incredibly honored to share some exciting news regarding: ${safeTopic}!\n\nBeing recognized in this area has been an amazing journey of growth and dedication.\n\nHere are three key takeaways from this experience:\n\n🔹 HARD WORK PAYS OFF: Consistency is everything.\n\n🔹 TEAM EFFORT: I couldn't have done it without the support of my amazing colleagues.\n\n🔹 NEVER STOP LEARNING: This is just a milestone, not the finish line.\n\nThank you to everyone who supported me! Let's keep pushing boundaries. 🚀 #Achievement #Milestone #CareerJourney`,
          x: `So proud to announce: ${safeTopic}! 🏆 It's been a long journey, but the hard work finally paid off. Onwards and upwards! 🚀 #Milestone #Growth`,
          instagram: `A moment I'll never forget! ✨ Honored and proud to share: ${safeTopic}. Huge thanks to everyone who supported me along the way! 🏆📸 #ProudMoment #Milestone #CareerGoals #Blessed`,
          facebook: `I wanted to take a moment to share some great personal news! 🎉 Regarding: ${safeTopic}. I am so incredibly grateful for the journey and the people who helped me get here! ❤️`,
          threads: `Just taking a moment to process this: ${safeTopic}. It feels surreal! 🤯 Grateful for the journey.`,
          whatsapp: `Hey guys! I finally got some news about: ${safeTopic}! 🏆 Super excited and wanted to share with you all first! 🎉`
        });
      }

      if (isEvent) {
        return JSON.stringify({
          linkedin: `🎤 What an incredible experience at the recent event discussing: ${safeTopic}!\n\nThe energy in the room was palpable, and the insights shared were truly game-changing.\n\nMy top 3 takeaways:\n\n🔹 NETWORKING MATTERS: The connections made are invaluable.\n\n🔹 INNOVATION IS EVERYWHERE: The ideas presented pushed the boundaries of what's possible.\n\n🔹 THE FUTURE IS BRIGHT: I left feeling more inspired than ever.\n\nDid anyone else attend? Let's connect! 🤝 #Networking #IndustryEvent`,
          x: `Just wrapped up an amazing session on ${safeTopic}! 🎤 My mind is blown by the insights shared today. 🤯 #Event #Networking`,
          instagram: `Behind the scenes from today's amazing session on ${safeTopic}! 📸 Such great energy and inspiring people. Can't wait for the next one! ✨ #EventVibes #Networking #IndustryEvent`,
          facebook: `Had an absolute blast today learning about ${safeTopic}! 🎤 It's always great to step out of the daily routine and connect with inspiring people. Who else loves attending these?`,
          threads: `The conversations happening around ${safeTopic} today were top tier. 🗣️ So much to think about!`,
          whatsapp: `Hey! I'm at the event for ${safeTopic} right now and it's amazing. 🎤 Let's catch up later so I can tell you all about it! 🏃‍♂️`
        });
      }

      if (isProduct) {
        return JSON.stringify({
          linkedin: `🚀 IT'S FINALLY HERE: ${safeTopic}!\n\nAfter months of hard work behind the scenes, we are thrilled to announce this major launch.\n\nWhy this matters:\n\n🔹 BUILT FOR YOU: We listened to your feedback.\n\n🔹 NEXT-GEN PERFORMANCE: Faster, better, and more reliable.\n\n🔹 SEAMLESS INTEGRATION: Designed to fit into your workflow perfectly.\n\nCheck it out and let us know what you think! We can't wait to hear your feedback. 💡 #ProductLaunch #Innovation`,
          x: `We just launched: ${safeTopic}! 🚀 It's live and ready for you to try. Let me know what you think! 💻 #Launch #Tech`,
          instagram: `It's official! 🚀 ${safeTopic} is now live! ✨ Swipe to see what we've been working so hard on. Link in bio! 📲 #LaunchDay #NewRelease #ProductDrop`,
          facebook: `Big news! 🎉 We just released ${safeTopic}! We've poured so much love into this and we are so excited for you to finally see it. Let us know your thoughts below! 👇`,
          threads: `Hitting the "deploy" button on ${safeTopic} felt so good. 🚀 It's out in the wild now!`,
          whatsapp: `Hey! We finally launched ${safeTopic}! 🚀 Go check it out and let me know if you run into any issues. Super excited! 💻`
        });
      }

      // Default Generic Response
      return JSON.stringify({
        linkedin: `🚀 Sharing some thoughts on: ${safeTopic}\n\nI've been exploring this space deeply lately, and the evolving landscape is truly fascinating.\n\nHere are three key observations:\n\n🔹 CONTINUOUS EVOLUTION: The pace of change is accelerating.\n\n🔹 ADAPTABILITY IS CRUCIAL: Those who pivot quickly will win.\n\n🔹 COLLABORATIVE EFFORT: Success in this area requires teamwork.\n\nWhat are your thoughts on ${safeTopic}? Let's discuss in the comments! 👇 #ProfessionalGrowth #IndustryTrends`,
        x: `Just some thoughts on ${safeTopic}! 🚀 It's absolutely fascinating how fast things move. What do you guys think? 💡 #Trending`,
        instagram: `Thinking about ${safeTopic} today ✨ It's amazing how much it impacts everything we do. 🚀 What are your thoughts? #DailyInspo #Growth #CareerJourney`,
        facebook: `Hey everyone! I wanted to share an update about ${safeTopic} today! 🚀 It's been an amazing journey learning more about it. Let me know what you think below! 💻`,
        threads: `Just thinking about ${safeTopic}. 📚 It's pretty wild when you really look into the details. 🤯`,
        whatsapp: `Hey! Have you seen the latest about ${safeTopic}? 🚀 It's absolutely incredible. Let's catch up soon! 💻`
      });
    }

    return `This is a dynamic mock response about ${safeTopic}. Run 'npx wrangler login' to use the real AI.`;
  }


  async generateCaption(topic: string, platform: string): Promise<string> {
    const systemPrompt = `You are an expert copywriter. Write an engaging social media post for ${platform}.`;
    const responseText = await this.runAIModel(systemPrompt, topic);
    return responseText.trim();
  }

  async generatePlatformSpecificContent(params: {
    topic: string;
    platforms: string[];
    audience?: string;
    tone?: string;
    goal?: string;
    keywords?: string;
    length?: string;
  }): Promise<Record<string, string>> {
    const { topic, platforms, audience, tone, goal, keywords, length } = params;

    const baseIdentity = `You are an elite, highly adaptable social media copywriter. You must output strictly valid JSON with keys: linkedin, x, instagram, facebook, threads, whatsapp. CRITICAL RULE: Adapt your tone seamlessly to the topic provided and user instructions. Write engaging, high-quality, human-like, viral-ready copy that feels authentic and native to each platform. Do NOT use placeholder text. Do NOT be generic or repetitive.`;

    const contextSection = `
    CONTENT CONTEXT (MANDATORY TO FOLLOW):
    - Main Topic: ${topic}
    - Target Audience: ${audience || 'General audience'}
    - Tone/Vibe: ${tone || 'Professional yet engaging'}
    - Primary Goal: ${goal || 'Engagement and awareness'}
    - Keywords to naturally include: ${keywords || 'None specified'}
    - Desired Length: ${length || 'Platform optimal'}
    
    INSTRUCTIONS: Use this context to drive the narrative. If the goal is hiring, add a CTA to apply. If the goal is engagement, ask a strong question. Ensure the tone matches strictly. Include relevant emojis naturally.
    `;

    let platformInstructions = '';

    for (const platform of platforms) {
      const resultKey = platform;
      let toneDescription = '';
      let formatInstruction = '';

      if (platform === 'linkedin') {
        toneDescription = 'High-quality, professional, detailed post optimized for engagement.';
        formatInstruction = `Must include: Strong hook, Context/Story, Bullet points for key takeaways, and a clear Call to Action. Use \\n\\n for paragraph breaks. Keep it structured and easy to skim.`;
      } else if (platform === 'x') {
        toneDescription = 'Short, catchy, "Build in Public" / "Tech Twitter" vibe. Direct and punchy.';
        formatInstruction = 'Maximum 2 sentences. Include exactly 2 highly relevant hashtags at the end.';
      } else if (platform === 'instagram') {
        toneDescription = 'Highly visual, aesthetic, behind-the-scenes or personal narrative.';
        formatInstruction = 'Start with a catchy visual hook. Add emojis. Add a block of exactly 15 hashtags at the bottom.';
      } else if (platform === 'facebook') {
        toneDescription = 'Community-focused, friendly, conversational, and relatable.';
        formatInstruction = 'Use a conversational opener. Always end by encouraging comments/questions directly.';
      } else if (platform === 'threads') {
        toneDescription = 'Modern casual conversation. Snappy, authentic, less marketing-speak.';
        formatInstruction = 'Make it sound like a personal, spontaneous thought or observation. Avoid heavy formatting.';
      } else if (platform === 'whatsapp') {
        toneDescription = 'Direct broadcast style. Urgent or casual update.';
        formatInstruction = '2-3 lines max. Include a clear call to action.';
      } else {
        toneDescription = 'Direct and engaging.';
        formatInstruction = 'Platform optimal.';
      }

      platformInstructions += `\nPlatform Key "${resultKey}":\n- Tone: ${toneDescription}\n- Format: ${formatInstruction}\n`;
    }

    const systemPrompt = `${baseIdentity}
${contextSection}
    
    You are generating social media content for multiple platforms simultaneously.
    
    PLATFORM-SPECIFIC INSTRUCTIONS:${platformInstructions}

    GENERAL FORMATTING RULES:
    - NEVER use ** or __ for bolding, as it breaks the UI. Use UPPERCASE for emphasis if absolutely necessary.
    - Use EMOJIS strategically as requested per platform.

    STRICT JSON RESPONSE REQUIREMENT:
    You must respond with ONLY this exact JSON structure and absolutely nothing else: {"linkedin": "...", "x": "...", "instagram": "...", "facebook": "...", "threads": "...", "whatsapp": "..."}

    You are a machine API. DO NOT output 'Here is the JSON' or any other conversational text. Your entire response must start with { and end with }.
    
    CRITICAL "SINGLE LINE" RULE:
    YOUR ENTIRE OUTPUT MUST BE A SINGLE CONTINUOUS LINE OF TEXT. DO NOT HIT THE 'ENTER' KEY OR USE ACTUAL NEWLINES AT ALL. 
    If you want a paragraph break, you MUST use the literal characters \\n\\n.
    Example of CORRECT output: {"linkedin": "Para 1.\\n\\nPara 2.", "x": "..."}
    Example of INCORRECT output (CRASHES SYSTEM): 
    {
      "linkedin": "Para 1."
    }
    
    You are generating content for platforms. Keep each platform's content concise so you do not run out of tokens. YOU MUST finish the JSON object with a closing bracket }.`;

    const rawText = await this.runAIModel(systemPrompt, topic);
    console.log("RAW AI RESPONSE:", rawText);

    let parsedData: Record<string, string> = {};

    try {
      // 1. Try to find anything that looks like a JSON object using Regex
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        try {
          parsedData = JSON.parse(jsonStr);
        } catch (e) {
          console.warn("Standard JSON parse failed. Attempting robust cleanup...");
          // Convert literal newlines to spaces to ensure JSON validity 
          // while preserving existing escaped \n sequences.
          parsedData = JSON.parse(jsonStr.replace(/\r?\n/g, ' '));
        }
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (error) {
      // 2. IF IT FAILS, DUMP THE RAW TEXT TO THE SCREEN
      console.error("JSON Parsing failed. Raw AI output:", rawText);
      parsedData = {
        linkedin: `CRITICAL ERROR. The AI sent this instead of JSON:\n\n${rawText}`,
        x: "Generation failed. Check LinkedIn tab for error log.",
        instagram: "Generation failed. Check LinkedIn tab for error log.",
        facebook: "Generation failed. Check LinkedIn tab for error log.",
        threads: "Generation failed. Check LinkedIn tab for error log.",
        whatsapp: "Generation failed. Check LinkedIn tab for error log."
      };
    }

    return parsedData;
  }

  async editContent(content: string, platform: string, action: string): Promise<string> {
    let actionInstruction = '';
    switch (action) {
      case 'shorten':
        actionInstruction = 'Make this content significantly shorter, punchier, and more concise without losing the core message.';
        break;
      case 'expand':
        actionInstruction = 'Expand on this content. Add more detail, context, and elaborate on the points naturally.';
        break;
      case 'improve_tone':
        actionInstruction = 'Improve the tone to be more engaging, fluid, and natural for social media.';
        break;
      case 'professional_rewrite':
        actionInstruction = 'Rewrite this entirely to sound highly professional, authoritative, and suitable for a corporate audience or B2B context.';
        break;
      case 'regenerate':
      default:
        actionInstruction = 'Regenerate this content completely. Provide a fresh take, new angle, and different phrasing while keeping the same core topic.';
        break;
    }

    const systemPrompt = `You are an expert social media copywriter specializing in editing and refining content. 
    Your task is to take the user's provided social media post for the platform "${platform}" and apply the following transformation:
    
    ACTION REQUIRED: ${actionInstruction}
    
    RULES:
    - Return ONLY the newly edited text.
    - Do NOT include quotes, explanations, or introductory text (like "Here is the rewritten version:").
    - Keep formatting appropriate for ${platform}.
    - If the platform is LinkedIn, ensure it uses line breaks (\\n\\n).`;

    const responseText = await this.runAIModel(systemPrompt, content);
    return responseText.trim();
  }

  async optimizeCrossPost(content: string, platform: string): Promise<string> {
    const systemPrompt = 'You are an expert social media formatter.';
    const responseText = await this.runAIModel(systemPrompt, prompt);
    return responseText.trim();
  }

  async generateHashtags(content: string): Promise<string> {
    const systemPrompt = 'You are an expert social media tagger. Read the user\'s post text and return exactly 3 highly relevant, industry-specific hashtags separated by spaces. Do not include any other text, commentary, or quotes. Just return the 3 hashtags (e.g. #Example #Test #Tag).';
    const responseText = await this.runAIModel(systemPrompt, content);
    return responseText.trim();
  }
}
