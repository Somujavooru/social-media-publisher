"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface PlatformConnection {
  id: string;
  name: string;
}

const platforms = [
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', color: 'bg-[#0077b5] border-[#0077b5]', supported: true },
  { id: 'x', name: 'X (Twitter)', icon: '𝕏', color: 'bg-black border-slate-700', supported: true },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: 'bg-[#1877F2] border-[#1877F2]', supported: true },
  { id: 'instagram', name: 'Instagram', icon: '📷', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 border-transparent', supported: false },
  { id: 'threads', name: 'Threads', icon: 'T', color: 'bg-black border-slate-700', supported: false }
];

export default function PlatformsPage() {
  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [forceReAuth, setForceReAuth] = useState<boolean>(false);
  
  useEffect(() => {
    // Check URL parameters for OAuth success/failure
    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get('error');
    if (error) {
       console.error('OAuth Error:', error);
       alert(`Authentication failed: ${error}`);
       window.history.replaceState({}, document.title, window.location.pathname);
    }
    const success = searchParams.get('success');
    if (success) {
       console.log('OAuth Success:', success);
       window.history.replaceState({}, document.title, window.location.pathname);
    }

    const fetchConnections = async () => {
      try {
        const response = await fetch('http://localhost:8787/api/platforms/me');
        if (response.ok) {
          const data = await response.json();
          setConnectedPlatforms(data.connectedPlatforms || []);
        }
      } catch (e) {
        console.error('Failed to fetch connections:', e);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchConnections();
  }, []);

  const handleConnect = async (platformId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform || !platform.supported) {
      alert('This platform is not yet fully supported.');
      return;
    }
    setLoading(platformId);
    // Redirect securely to backend OAuth initiator
    const baseUrl = `http://localhost:8787/api/oauth/${platformId}/connect`;
    window.location.href = forceReAuth ? `${baseUrl}?force=true` : baseUrl;
  };

  const handleDisconnect = async (dbId: string, platformId: string) => {
    setLoading(platformId);
    try {
      const response = await fetch(`http://localhost:8787/api/platforms/${dbId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setConnectedPlatforms(prev => prev.filter(p => p.id !== dbId));
      }
    } catch (e) {
      console.error('Failed to disconnect:', e);
    } finally {
      setLoading(null);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen p-12 bg-background flex flex-col items-center justify-center">
         <div className="animate-spin h-8 w-8 text-blue-500 rounded-full border-4 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-12 bg-background flex flex-col items-center relative">
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-white">Connect Platforms</h1>
          <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-all font-medium text-sm">
            &larr; Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-8 px-4">
          <input 
            type="checkbox" 
            id="forceAuth" 
            checked={forceReAuth} 
            onChange={(e) => setForceReAuth(e.target.checked)}
            className="w-4 h-4 bg-slate-900 border-slate-700 rounded text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="forceAuth" className="text-sm text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            Force Re-authentication (Clear old tokens)
          </label>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {platforms.map(platform => {
            const connection = connectedPlatforms.find(p => p.name.toLowerCase() === platform.name.toLowerCase() || p.name.toLowerCase() === platform.id);
            const isConnected = !!connection;
            const isLoading = loading === platform.id;
            
            return (
              <div key={platform.id} className={`flex flex-col p-6 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-sm transition-all ${platform.supported ? 'group hover:border-slate-600' : 'opacity-70 saturate-50'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 flex items-center justify-center rounded-xl font-bold text-white text-xl ${platform.color} shadow-lg`}>
                      {platform.icon}
                    </div>
                    <span className="font-semibold text-lg text-slate-200">{platform.name}</span>
                  </div>
                  
                  {isConnected ? (
                    <button 
                      onClick={() => handleDisconnect(connection.id, platform.id)}
                      disabled={isLoading}
                      className="px-5 py-2 rounded-xl text-sm font-medium transition-all border bg-emerald-600/20 text-emerald-400 border-emerald-500/50 hover:bg-red-600/20 hover:text-red-400 hover:border-red-500/50 group/btn"
                    >
                      {isLoading ? '...' : (
                        <>
                          <span className="group-hover/btn:hidden">Connected</span>
                          <span className="hidden group-hover/btn:inline">Disconnect</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleConnect(platform.id)}
                      disabled={isLoading || !platform.supported}
                      className={`px-5 py-2 rounded-xl text-sm font-medium transition-all border ${
                        platform.supported 
                          ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white' 
                          : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {isLoading ? '...' : (platform.supported ? 'Connect' : 'Beta / Coming Soon')}
                    </button>
                  )}
                </div>
                {!platform.supported && (
                  <div className="mt-4 text-sm text-slate-400 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                    Integration under development. API access in progress.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
