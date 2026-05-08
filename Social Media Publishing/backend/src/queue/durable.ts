export class PublishDurableObject {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // Simple state management for a post (e.g. keeping track of retry attempts across distributed workers)
    if (url.pathname.startsWith('/status')) {
      const postId = url.searchParams.get('postId');
      if (!postId) return new Response('Missing postId', { status: 400 });

      let attempts = await this.state.storage.get<number>(`attempts_${postId}`) || 0;
      
      if (request.method === 'POST') {
        attempts += 1;
        await this.state.storage.put(`attempts_${postId}`, attempts);
        return new Response(JSON.stringify({ attempts }), { status: 200 });
      }

      return new Response(JSON.stringify({ attempts }), { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
}
