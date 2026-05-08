"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchStatus = async () => {
    try {
      const response = await fetch('http://localhost:8787/api/status', {
        headers: { 'Authorization': 'Bearer mock_token' }
      });
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (e) {
      console.error('Failed to fetch status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (postPlatformId: string) => {
    try {
      const response = await fetch(`http://localhost:8787/api/status/retry/${postPlatformId}`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer mock_token' }
      });
      if (response.ok) {
        fetchStatus();
      }
    } catch (e) {
      console.error('Retry failed:', e);
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter === 'all') return true;
    return post.postStatus === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'text-emerald-400 bg-emerald-400/10';
      case 'scheduled': return 'text-blue-400 bg-blue-400/10';
      case 'failed': return 'text-red-400 bg-red-400/10';
      case 'pending': return 'text-amber-400 bg-amber-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-background">
      <div className="z-10 max-w-6xl w-full items-center justify-between flex mb-12">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
          Social Dashboard
        </h1>
        <div className="flex gap-4">
          <Link href="/post/create" className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl shadow-lg transition-all font-semibold flex items-center gap-2">
            ✨ Create Post
          </Link>
          <Link href="/platforms" className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-lg border border-slate-700 transition-all font-semibold">
            Manage Platforms
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mb-12">
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl transition-all hover:border-blue-500/30">
          <h2 className="text-3xl font-bold mb-1 text-white">{posts.filter(p => p.postStatus === 'scheduled').length}</h2>
          <p className="text-slate-400 text-sm font-medium">Scheduled Posts</p>
        </div>
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl transition-all hover:border-emerald-500/30">
          <h2 className="text-3xl font-bold mb-1 text-white">{posts.filter(p => p.postStatus === 'published').length}</h2>
          <p className="text-slate-400 text-sm font-medium">Total Published</p>
        </div>
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl transition-all hover:border-red-500/30">
          <h2 className="text-3xl font-bold mb-1 text-white">{posts.filter(p => p.postStatus === 'failed').length}</h2>
          <p className="text-slate-400 text-sm font-medium">Failed Attempts</p>
        </div>
      </div>

      <div className="w-full max-w-6xl bg-slate-900/40 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm shadow-2xl">
        <div className="p-6 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/20">
          <h3 className="text-xl font-bold text-white">Publishing History</h3>
          <div className="flex gap-2">
            {['all', 'published', 'scheduled', 'failed'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-500 text-xs font-bold uppercase tracking-wider bg-slate-900/40">
                <th className="px-6 py-4">Post Content</th>
                <th className="px-6 py-4">Platforms</th>
                <th className="px-6 py-4">Scheduled</th>
                <th className="px-6 py-4">Overall Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 animate-pulse font-medium">Loading activity logs...</td>
                </tr>
              ) : filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium">No posts found matching the filter.</td>
                </tr>
              ) : filteredPosts.map((post) => (
                <tr key={post.postId} className="group hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-slate-200 text-sm line-clamp-2 max-w-md font-medium">{post.content}</div>
                    <div className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-tight">{new Date(post.createdAt).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      {post.platforms.map((p: any) => (
                        <div key={p.postPlatformId} className="flex items-center justify-between gap-3 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{p.platformName}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize ${getStatusColor(p.status)}`}>
                              {p.status}
                            </span>
                          </div>
                          {p.status === 'failed' && (
                            <button 
                              onClick={() => handleRetry(p.postPlatformId)}
                              className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-md transition-colors font-bold"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Immediate'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(post.postStatus)}`}>
                      {post.postStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
