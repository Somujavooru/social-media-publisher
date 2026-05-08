"use client";
import React, { useState, useRef } from 'react';
import Link from 'next/link';

export default function CreatePostPage() {
  const [basePrompt, setBasePrompt] = useState('');
  const [contentStore, setContentStore] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>('topic');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generatingHashtags, setGeneratingHashtags] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [directPublishing, setDirectPublishing] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; link?: string } | null>(null);
  const [connectedPlatformNames, setConnectedPlatformNames] = useState<string[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // New AI context fields
  const [audience, setAudience] = useState<string>('');
  const [tone, setTone] = useState<string>('professional');
  const [goal, setGoal] = useState<string>('engagement');
  const [keywords, setKeywords] = useState<string>('');
  const [length, setLength] = useState<string>('optimal');
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const isScheduling = scheduledAt !== '' && new Date(scheduledAt) > new Date();

  React.useEffect(() => {
    const fetchConnections = async () => {
      try {
        const response = await fetch('https://social-media-publisher.somashekharjavooru.workers.dev/api/platforms/me');
        if (response.ok) {
          const data = await response.json();
          const names = (data.connectedPlatforms || []).map((p: any) => p.name.toLowerCase());
          // Map backend names to frontend IDs
          const mappedNames = names.map((n: string) => {
            if (n === 'x (twitter)') return 'x';
            return n;
          });
          setConnectedPlatformNames(mappedNames);
        }
      } catch (e) {
        console.error('Failed to fetch connections:', e);
      } finally {
        setIsInitialLoading(false);
      }
    };
    fetchConnections();
  }, []);

  const showNotification = (type: 'success' | 'error', message: string, link?: string) => {
    setNotification({ type, message, link });
    setTimeout(() => setNotification(null), 8000);
  };
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availablePlatforms = [
    { id: 'linkedin', name: 'LinkedIn' },
    { id: 'x', name: 'X (Twitter)' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'threads', name: 'Threads' },
    { id: 'whatsapp', name: 'WhatsApp' }
  ];

  const handleAiGenerate = async () => {
    if (!basePrompt.trim()) {
      alert("Please write a short topic or idea in the box first for the AI to expand on!");
      return;
    }
    
    if (connectedPlatformNames.length === 0) {
      showNotification('error', 'You have no platforms connected. Please go to the Platforms page first.');
      return;
    }

    setAiGenerating(true);
    
    // Read the current text as the user's prompt
    const userPrompt = basePrompt.trim();
    console.log("Sending prompt to AI backend:", userPrompt);

    try {
      // Only generate for platforms the user has actually connected
      const targetPlatforms = availablePlatforms
        .map(p => p.id)
        .filter(id => connectedPlatformNames.includes(id));
      
      const response = await fetch('https://social-media-publisher.somashekharjavooru.workers.dev/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userPrompt,
          platforms: targetPlatforms.length > 0 ? targetPlatforms : ['linkedin'],
          audience: audience || undefined,
          tone: tone || undefined,
          goal: goal || undefined,
          keywords: keywords || undefined,
          length: length || undefined
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.results) {
          setContentStore(prev => ({ ...prev, ...data.results }));
          const nextTab = targetPlatforms.length > 0 ? targetPlatforms[0] : 'linkedin';
          setActiveTab(nextTab); // Set default display after generation
          console.log("Received universal AI response successfully.");
        } else {
          // Fallback
          const content = data.result;
          const initialContents: Record<string, string> = {};
          targetPlatforms.forEach(p => initialContents[p] = content);
          setContentStore(initialContents);
          const nextTab = targetPlatforms.length > 0 ? targetPlatforms[0] : 'linkedin';
          setActiveTab(nextTab);
          console.log("Received AI response successfully.");
        }
      } else {
        // Catch HTTP Errors and display in text box
        let errorText = `HTTP ERROR ${response.status}: ${response.statusText}`;
        try {
          const errData = await response.text();
          errorText += `\n\nServer Response:\n${errData}`;
        } catch (e) {
          errorText += `\n\n(Could not read response body)`;
        }
        
        const errorContents: Record<string, string> = {};
        availablePlatforms.forEach(p => errorContents[p.id] = errorText);
        setContentStore(errorContents);
        setActiveTab(targetPlatforms.length > 0 ? targetPlatforms[0] : 'linkedin');
      }
    } catch (e) {
      console.error("AI Error:", e);
      const networkErrorText = `--- NETWORK ERROR ---\nFailed to connect to the backend API.\n\nDetails: ${e}\n\nPlease ensure your backend is running on port 8787 (npm run dev in backend folder).`;
      
      const errorContents: Record<string, string> = {};
      availablePlatforms.map(p => p.id).forEach(p => errorContents[p] = networkErrorText);
      setContentStore(errorContents);
      setActiveTab('linkedin');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleInlineEdit = async (action: string) => {
    if (activeTab === 'topic') return;
    const currentContent = contentStore[activeTab];
    if (!currentContent) return;

    setIsEditing(action);
    try {
      const response = await fetch('https://social-media-publisher.somashekharjavooru.workers.dev/api/ai/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent, platform: activeTab, action })
      });
      if (response.ok) {
        const data = await response.json();
        setContentStore(prev => ({ ...prev, [activeTab]: data.result }));
      } else {
        const err = await response.json();
        showNotification('error', `Edit failed: ${err.error}`);
      }
    } catch (e) {
      showNotification('error', 'Network error during inline edit.');
    } finally {
      setIsEditing(null);
    }
  };


  const handlePlatformToggle = (platformId: string) => {
    setSelectedPlatforms(prev => {
      const isSelecting = !prev.includes(platformId);
      const next = isSelecting ? [...prev, platformId] : prev.filter(p => p !== platformId);
      
      // Auto-switch to the platform that was just selected
      if (isSelecting) {
        setActiveTab(platformId);
      } else if (activeTab === platformId) {
        // If we just unchecked the current active platform, go back to topic or the next available
        setActiveTab(next.length > 0 ? next[next.length - 1] : 'topic');
      }
      
      return next;
    });
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleHashtagGenerate = async () => {
    const currentContent = contentStore[activeTab] || '';
    if (!currentContent.trim()) {
      alert("Please select a platform and generate content first!");
      return;
    }
    setGeneratingHashtags(true);
    
    try {
      const response = await fetch('https://social-media-publisher.somashekharjavooru.workers.dev/api/ai/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent.trim() })
      });
      
      if (response.ok) {
        const data = await response.json();
        setContentStore(prev => ({
          ...prev,
          [activeTab]: prev[activeTab].trim() + '\n\n' + data.result
        }));
      } else {
        const err = await response.json();
        alert(`Failed to generate hashtags: ${err.error}`);
      }
    } catch (e) {
      console.error("Hashtag Error:", e);
      alert("Failed to connect to AI service for hashtags.");
    } finally {
      setGeneratingHashtags(false);
    }
  };

  const handlePublish = async () => {
    const hasPlatformContent = selectedPlatforms.every(p => contentStore[p] && contentStore[p].trim() !== '');
    if (!hasPlatformContent || selectedPlatforms.length === 0) {
      showNotification('error', 'Please ensure all selected platforms have content generated/edited.');
      return;
    }

    if (isScheduling && new Date(scheduledAt) <= new Date()) {
      showNotification('error', 'Scheduled time must be in the future.');
      return;
    }

    setPublishing(true);
    const endpoint = isScheduling ? 'https://social-media-publisher.somashekharjavooru.workers.dev/api/schedule' : 'https://social-media-publisher.somashekharjavooru.workers.dev/api/publish';
    const payload: any = {
      content: basePrompt,
      platform_contents: contentStore,
      platforms: selectedPlatforms,
      media_id: imagePreview || undefined,
    };
    if (isScheduling) payload.scheduled_at = new Date(scheduledAt).toISOString();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock_token' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'failed') {
          // If any platform failed, show the error
          const errors = data.results.filter((r: any) => r.status === 'error').map((r: any) => `${r.platform}: ${r.message}`).join(', ');
          showNotification('error', `Publishing failed for some platforms: ${errors}`);
        } else if (isScheduling) {
          const scheduledDate = new Date(data.scheduledAt).toLocaleString();
          showNotification('success', `Post scheduled for ${scheduledDate}. It will be published automatically.`);
          setScheduledAt('');
          setBasePrompt('');
          setContentStore({});
          setSelectedPlatforms([]);
          setActiveTab('topic');
          removeImage();
        } else {
          const urn = data.externalUrns?.[0];
          const link = urn ? `https://www.linkedin.com/feed/update/${urn}` : undefined;
          showNotification('success', 'Your post has been published successfully!', link);
          setBasePrompt('');
          setContentStore({});
          setSelectedPlatforms([]);
          setActiveTab('topic');
          removeImage();
        }
      } else {
        const err = await response.json();
        showNotification('error', `Failed: ${err.error || 'Unknown error'}${err.details ? ' — ' + err.details : ''}`);
      }
    } catch (e) {
      console.error('Publish error:', e);
      showNotification('error', 'A network error occurred. Is the backend running?');
    } finally {
      setPublishing(false);
    }
  };

  const handleDirectXPublish = async () => {
    const xContent = contentStore['x'] || '';
    if (!xContent.trim()) {
      showNotification('error', 'Please generate or write content for X first.');
      return;
    }
    setDirectPublishing(true);
    try {
      const response = await fetch('https://social-media-publisher.somashekharjavooru.workers.dev/api/publish/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock_token' },
        body: JSON.stringify({ content: xContent, media_id: imagePreview || undefined }),
      });
      if (response.ok) {
        const data = await response.json();
        showNotification('success', 'Tweet published successfully!', data.url);
      } else {
        const err = await response.json();
        showNotification('error', `X publish failed: ${err.error}`);
      }
    } catch (e) {
      showNotification('error', 'Network error publishing to X.');
    } finally {
      setDirectPublishing(false);
    }
  };

  return (
    <div className="min-h-screen p-12 bg-background flex flex-col items-center">
      <div className="max-w-3xl w-full">

        {/* Inline Notification Banner */}
        {notification && (
          <div className={`mb-6 px-5 py-4 rounded-2xl border flex items-start gap-3 shadow-lg transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/60 border-red-500/40 text-red-300'
          }`}>
            <span className="text-xl">{notification.type === 'success' ? '✅' : '❌'}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{notification.message}</p>
              {notification.link && (
                <a href={notification.link} target="_blank" rel="noreferrer"
                  className="text-xs underline mt-1 inline-block opacity-80 hover:opacity-100">
                  View Post →
                </a>
              )}
            </div>
            <button onClick={() => setNotification(null)} className="text-current opacity-50 hover:opacity-100 text-lg leading-none">✕</button>
          </div>
        )}

        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            Create a New Post
          </h1>
          <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700">
            &larr; Dashboard
          </Link>
        </div>
        
        <div className="space-y-8 bg-slate-900/80 p-10 rounded-3xl border border-slate-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex flex-col gap-4 mb-6 bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50">
              <div className="flex flex-col gap-1 w-full">
                <label className="block text-sm font-semibold text-slate-200">What's the main topic?</label>
                <input 
                  type="text"
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  placeholder="e.g. Launching our new AI-powered analytics dashboard..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-lg"
                />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Tone</label>
                  <select value={tone} onChange={e => setTone(e.target.value)} className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50">
                    <option value="professional">👔 Professional</option>
                    <option value="casual">👋 Casual</option>
                    <option value="marketing">🚀 Marketing/Sales</option>
                    <option value="technical">💻 Technical</option>
                    <option value="motivational">🔥 Motivational</option>
                    <option value="startup">🦄 Startup/Founder</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Goal</label>
                  <select value={goal} onChange={e => setGoal(e.target.value)} className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50">
                    <option value="engagement">💬 Engagement</option>
                    <option value="announcement">📢 Announcement</option>
                    <option value="learning">📚 Education/Learning</option>
                    <option value="promotion">🛍️ Promotion/Sales</option>
                    <option value="hiring">🤝 Hiring</option>
                    <option value="branding">✨ Brand Awareness</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Length</label>
                  <select value={length} onChange={e => setLength(e.target.value)} className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50">
                    <option value="optimal">⚡ Platform Optimal</option>
                    <option value="short">📉 Short & Punchy</option>
                    <option value="long">📈 Long & Detailed</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Target Audience</label>
                  <input type="text" value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. Developers" className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-600" />
                </div>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-xs font-semibold text-slate-400">Keywords / Hashtags to Include</label>
                <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. AI, Future of Work, #Innovation" className="w-full bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-600" />
              </div>
            </div>

            <div className="flex justify-between items-end mb-3">
              <div className="flex flex-col gap-3 overflow-hidden w-full max-w-[70%]">
                <label className="block text-sm font-semibold text-slate-200 shrink-0">Platform Variants</label>
                <div 
                  className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <button
                    onClick={() => setActiveTab('topic')}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      activeTab === 'topic' 
                        ? 'bg-slate-800 border-slate-600 text-white' 
                        : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    PLAN
                  </button>
                  {availablePlatforms.map(platform => {
                    const isConnected = connectedPlatformNames.includes(platform.id);
                    const hasContent = !!contentStore[platform.id];
                    
                    return (
                      <button
                        key={platform.id}
                        onClick={() => setActiveTab(platform.id)}
                        className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-2 ${
                          activeTab === platform.id 
                            ? 'bg-purple-600/20 border-purple-500/50 text-purple-200' 
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                        } ${!isConnected ? 'opacity-50 grayscale-[0.5]' : ''}`}
                      >
                        {platform.name}
                        {hasContent && (
                          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                        )}
                        {!isConnected && <span className="text-[9px] opacity-60 font-normal normal-case">(Offline)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pb-1">
                <button 
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || publishing}
                  className="text-sm px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all flex items-center gap-2 font-bold disabled:opacity-50 disabled:shadow-none"
                >
                  {aiGenerating ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white/20 border-t-white rounded-full"></span> Generating...</>
                  ) : (
                    '✨ Generate All'
                  )}
                </button>
              </div>
            </div>

            <textarea 
              value={aiGenerating && activeTab !== 'topic' ? 'Loading AI content...' : (isEditing ? 'Editing content...' : (activeTab === 'topic' ? basePrompt : (contentStore[activeTab.toLowerCase()] || '')))}
              onChange={(e) => {
                const val = e.target.value;
                if (activeTab === 'topic') {
                  setBasePrompt(val);
                } else {
                  setContentStore(prev => ({ ...prev, [activeTab.toLowerCase()]: val }));
                }
              }}
              disabled={publishing || aiGenerating || isEditing !== null}
              className={`w-full h-56 border rounded-2xl p-6 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 transition-all resize-none shadow-inner placeholder:text-slate-700 disabled:opacity-60 ${
                (aiGenerating || isEditing) && activeTab !== 'topic' ? 'bg-slate-900 text-purple-400 border-purple-500/50 animate-pulse' : 'bg-slate-950/80 border-slate-700 text-slate-100'
              }`}
              placeholder={activeTab === 'topic' ? "What's the main idea?" : `Write your ${activeTab} post here...`}
            />
            
            {activeTab !== 'topic' && contentStore[activeTab] && (
              <div className="flex flex-wrap gap-2 mt-3 p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center px-2">AI Edit</span>
                <button onClick={() => handleInlineEdit('regenerate')} disabled={isEditing !== null} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50">🔄 Regenerate</button>
                <button onClick={() => handleInlineEdit('improve_tone')} disabled={isEditing !== null} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50">🎭 Improve Tone</button>
                <button onClick={() => handleInlineEdit('shorten')} disabled={isEditing !== null} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50">✂️ Shorten</button>
                <button onClick={() => handleInlineEdit('expand')} disabled={isEditing !== null} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50">📝 Expand</button>
                <button onClick={() => handleInlineEdit('professional_rewrite')} disabled={isEditing !== null} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50">👔 Professional Rewrite</button>
              </div>
            )}
            
            {imagePreview && (
              <div className="mt-4 relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-32 w-auto rounded-xl border border-slate-700 shadow-md object-cover" />
                <button 
                  onClick={removeImage}
                  disabled={publishing}
                  className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold hover:bg-red-600 shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
                  title="Remove Image"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mt-3">
              <div className="flex gap-2">
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handleImageChange} 
                   accept="image/png, image/jpeg" 
                   className="hidden" 
                 />
                 <button 
                   onClick={handleImageClick}
                   disabled={publishing}
                   className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors border border-slate-700 disabled:opacity-50" 
                   title="Add Photo"
                 >
                   📷
                 </button>
                 <button 
                   onClick={handleHashtagGenerate}
                   disabled={publishing || generatingHashtags}
                   className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors border border-slate-700 disabled:opacity-50 font-bold" 
                   title="Auto-Append Hashtags"
                 >
                   {generatingHashtags ? '...' : '#'}
                 </button>
              </div>
              <div className="flex items-center gap-4">
                {activeTab === 'x' && (
                  <button 
                    onClick={handleDirectXPublish}
                    disabled={publishing || directPublishing}
                    className="px-4 py-1.5 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    {directPublishing ? 'Publishing...' : '𝕏 Publish to X'}
                  </button>
                )}
                <span className={`text-xs font-medium ${activeTab === 'x' && (contentStore['x'] || '').length > 280 ? 'text-red-500' : 'text-slate-500'}`}>
                  {(activeTab === 'topic' ? basePrompt : (contentStore[activeTab.toLowerCase()] || '')).length} {activeTab === 'x' ? '/ 280' : ''}
                </span>
              </div>
            </div>
          </div>
          
          <div className="relative z-10">
            <label className="block text-sm font-semibold text-slate-200 mb-4">Destination Platforms</label>
            <div className="flex flex-wrap gap-4">
              {availablePlatforms.filter(p => connectedPlatformNames.includes(p.id)).map(platform => (
                <label 
                  key={platform.id} 
                  className={`flex items-center gap-3 cursor-pointer px-5 py-3 rounded-xl border transition-all shadow-sm ${
                    selectedPlatforms.includes(platform.id) 
                      ? 'bg-slate-800/80 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                      : 'bg-slate-900/50 border-slate-700 hover:bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedPlatforms.includes(platform.id)}
                    onChange={() => handlePlatformToggle(platform.id)}
                    disabled={publishing}
                    className="form-checkbox h-4 w-4 text-purple-500 rounded bg-slate-900 border-slate-600 focus:ring-purple-500 disabled:opacity-60" 
                  />
                  <span className={`text-sm font-medium ${selectedPlatforms.includes(platform.id) ? 'text-purple-100' : 'text-slate-300'}`}>
                    {platform.name}
                  </span>
                </label>
              ))}
              {availablePlatforms.filter(p => !connectedPlatformNames.includes(p.id)).length > 0 && (
                <Link href="/platforms" className="flex items-center gap-2 px-5 py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all text-sm">
                  + Connect More
                </Link>
              )}
            </div>
            {connectedPlatformNames.length === 0 && !isInitialLoading && (
              <p className="mt-4 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 p-3 rounded-xl">
                ⚠️ You haven't connected any social accounts yet. <Link href="/platforms" className="underline font-bold">Go connect some →</Link>
              </p>
            )}
          </div>

          {/* DateTime Scheduler */}
          <div className="mt-6 relative z-10">
            <label className="block text-sm font-semibold text-slate-400 mb-2">📅 Schedule for Later <span className="text-slate-600 font-normal">(optional)</span></label>
            <div className="flex items-center gap-3">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                disabled={publishing}
                className="bg-slate-950/60 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 [color-scheme:dark]"
              />
              {scheduledAt && (
                <button onClick={() => setScheduledAt('')} className="text-slate-500 hover:text-slate-300 text-xs underline">Clear</button>
              )}
              {isScheduling && (
                <span className="text-xs text-amber-400 font-medium animate-pulse">⏰ Will be scheduled</span>
              )}
            </div>
          </div>

          <div className="pt-8 flex justify-end gap-4 border-t border-slate-800/80 relative z-10 mt-8">
            <button
              disabled={publishing}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors font-semibold border border-slate-700 text-sm disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className={`px-8 py-3 text-white rounded-xl transition-all font-semibold text-sm transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none disabled:shadow-none ${
                isScheduling
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
              }`}
            >
              {publishing
                ? (isScheduling ? 'Scheduling...' : 'Publishing...')
                : (isScheduling ? '⏰ Schedule Post' : 'Publish Now')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
