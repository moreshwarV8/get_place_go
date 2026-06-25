import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Bot, User as UserIcon } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlaceCard } from '@/components/places/PlaceCard';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useTasteProfile } from '@/hooks/useTasteProfile';
import { Place } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  places?: Place[];
}

const STARTERS = [
  'A chill evening with my partner, somewhere quiet and green',
  'Cafe to code all day with wifi and power in Baner',
  'Cheap tasty dinner with friends in Koregaon Park',
];

export default function Concierge() {
  const { coords, request } = useGeolocation();
  const taste = useTasteProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { request(); }, [request]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('concierge', {
        body: {
          messages: next.map(m => ({ role: m.role, content: m.content })),
          preferences: taste.hasData ? { vibes: taste.topVibes, areas: taste.topAreas } : undefined,
        },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, places: data.places || [] }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Something went wrong'}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 pb-32">
        <div className="container mx-auto px-4 max-w-3xl">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-4">
                <Sparkles className="w-4 h-4" /> <span className="text-sm font-medium">AI Concierge</span>
              </div>
              <h1 className="font-display text-3xl font-bold mb-2">Tell me what you're in the mood for</h1>
              <p className="text-muted-foreground mb-8">
                I only suggest <strong>real places</strong> from our Pune database — no made-up spots.
              </p>
              <div className="flex flex-col gap-2 max-w-xl mx-auto">
                {STARTERS.map(s => (
                  <button key={s} onClick={() => send(s)} className="text-left px-4 py-3 rounded-xl border hover:border-primary hover:bg-muted/50 transition-colors text-sm">
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/15 text-accent'}`}>
                    {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`flex-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      {m.content}
                    </div>
                    {m.places && m.places.length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-4 mt-4 text-left">
                        {m.places.slice(0, 4).map(p => (
                          <PlaceCard key={p.id} place={p} userLocation={coords} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center"><Bot className="w-4 h-4" /></div>
                  <div className="px-4 py-3 rounded-2xl bg-muted"><Loader2 className="w-4 h-4 animate-spin" /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </main>

      {/* Composer */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 max-w-3xl py-4">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for a place or plan…" disabled={loading} />
            <Button type="submit" disabled={loading || !input.trim()}><Send className="w-4 h-4" /></Button>
          </form>
        </div>
      </div>
    </div>
  );
}
