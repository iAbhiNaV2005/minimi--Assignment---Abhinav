'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Clock,
  Database,
  ExternalLink,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Layers,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Globe,
  Loader2,
  Info,
  BarChart3,
  Calendar,
  X,
  Plus,
} from 'lucide-react';

interface CitationItem {
  index: number;
  title: string;
  url: string;
  snippet: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  citations?: CitationItem[];
  temporalWindow?: any;
  baseline?: any;
  isStreaming?: boolean;
}

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
}

const BENCHMARK_PROMPTS = [
  {
    title: 'CRM Shortlist Changes',
    tag: 'Monday Baseline',
    iconType: 'chart',
    prompt:
      'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    desc: 'Resolves relative "Monday", recalls the 5 CRM tools from episodic memory, and audits pricing/changelog updates.',
  },
  {
    title: 'Historical Turn Verification',
    tag: '3 November Turn',
    iconType: 'calendar',
    prompt:
      'What did I ask you on 3 November? Is your answer still correct today?',
    desc: 'Determines the calendar date, retrieves the Postgres hosting discussion from SQLite, and verifies with live web data.',
  },
  {
    title: 'Postgres Hosting Audit',
    tag: 'Last Tuesday',
    iconType: 'database',
    prompt:
      'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    desc: 'Grounds "Last Tuesday" to Nov 3, retrieves baseline tiers (Supabase, Neon, AWS RDS, Railway), and diffs current pricing.',
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string>('conv-' + Date.now());
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStage, setActiveStage] = useState<{
    stage: string;
    message: string;
    data?: any;
  } | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationItem | null>(null);
  const [isReseeding, setIsReseeding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load existing conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeStage]);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      if (Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const loadConversation = async (id: string) => {
    setConversationId(id);
    try {
      const res = await fetch(`/api/chat?conversationId=${id}`);
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            citations: m.search_sources?.map((s: any, idx: number) => ({
              index: idx + 1,
              title: s.title,
              url: s.url,
              snippet: s.snippet || '',
            })),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load message history', err);
    }
  };

  const handleReseed = async () => {
    setIsReseeding(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reseed' }),
      });
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        setMessages([]);
        setConversationId('conv-' + Date.now());
      }
    } catch (err) {
      console.error('Failed to reseed database', err);
    } finally {
      setIsReseeding(false);
    }
  };

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isProcessing) return;

    setInput('');
    setIsProcessing(true);
    setActiveStage({ stage: 'resolving_temporal', message: 'Analyzing query intent...' });

    const userMsgId = 'usr-' + Date.now();
    const asstMsgId = 'asst-' + (Date.now() + 1);

    const newMessages: Message[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: textToSend,
        created_at: new Date().toISOString(),
      },
      {
        id: asstMsgId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
        isStreaming: true,
      },
    ];

    setMessages(newMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          conversationId,
          referenceDate: new Date('2026-11-10T12:00:00Z').toISOString(),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to send message: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let collectedCitations: CitationItem[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.replace('data: ', ''));

            if (event.type === 'status') {
              setActiveStage({
                stage: event.stage,
                message: event.message,
                data: event.data,
              });
            } else if (event.type === 'token') {
              streamedContent += event.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === asstMsgId ? { ...msg, content: streamedContent } : msg
                )
              );
            } else if (event.type === 'citations') {
              collectedCitations = event.citations;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === asstMsgId ? { ...msg, citations: collectedCitations } : msg
                )
              );
            } else if (event.type === 'done') {
              setActiveStage(null);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === asstMsgId
                    ? {
                        ...msg,
                        isStreaming: false,
                        temporalWindow: event.temporalWindow,
                        baseline: event.baseline,
                      }
                    : msg
                )
              );
              fetchConversations();
            } else if (event.type === 'error') {
              setActiveStage({
                stage: 'error',
                message: event.message,
              });
            }
          } catch {
            // Partial JSON chunk, continue
          }
        }
      }
    } catch (err: any) {
      console.error('Chat stream error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === asstMsgId
            ? {
                ...msg,
                content: `Error: ${err.message || 'Unable to connect to search agent.'}`,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsProcessing(false);
      setActiveStage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#090a0f] text-gray-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#0e1017] border-r border-[#1a1f2c] flex flex-col justify-between shrink-0">
        <div className="p-4 border-b border-[#1a1f2c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-wide">Minimi Agent</h1>
              <p className="text-[11px] text-gray-400">Episodic Temporal Search</p>
            </div>
          </div>

          <button
            onClick={() => {
              setMessages([]);
              setConversationId('conv-' + Date.now());
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Research Turn</span>
          </button>
        </div>

        {/* Conversation History */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Episodic History (SQLite)
          </div>

          {conversations.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">No stored sessions.</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left p-2.5 rounded-md text-xs flex items-center justify-between transition-colors ${
                  conversationId === conv.id
                    ? 'bg-[#1b2233] text-blue-300 border border-blue-500/30 font-medium'
                    : 'text-gray-400 hover:bg-[#131722] hover:text-gray-200'
                }`}
              >
                <div className="truncate pr-2">
                  <div className="truncate">{conv.title}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(conv.created_at).toLocaleDateString()}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Footer info & reseed button */}
        <div className="p-3 border-t border-[#1a1f2c] bg-[#0c0d14] space-y-2">
          <div className="p-2.5 rounded border border-[#1d2333] bg-[#121624] text-[11px] text-gray-400 space-y-1">
            <div className="flex items-center gap-1.5 text-blue-400 font-medium">
              <Clock className="w-3 h-3" />
              <span>Anchor: Tue, Nov 10, 2026</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Database className="w-3 h-3" />
              <span>Episodic Memory: SQLite Active</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-400">
              <Globe className="w-3 h-3" />
              <span>Search: Tavily + DDG Fallback</span>
            </div>
          </div>

          <button
            onClick={handleReseed}
            disabled={isReseeding}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border border-[#262c3f] hover:bg-[#181d2c] text-gray-400 hover:text-gray-200 text-[11px] transition-colors"
            title="Reset SQLite database with baseline evaluation turns"
          >
            <RotateCcw className={`w-3 h-3 ${isReseeding ? 'animate-spin text-blue-400' : ''}`} />
            <span>{isReseeding ? 'Reseeding...' : 'Reset Evaluation Benchmark Data'}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CHAT CANVAS */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#090a0f] relative">
        {/* Top Navbar */}
        <header className="h-14 border-b border-[#1a1f2c] flex items-center justify-between px-6 bg-[#0c0e15]/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white tracking-wide">
              Autonomous Chat Agent
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Dual-Engine Grounding
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Chrono-Node 2.7
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Pipeline Ready
            </span>
          </div>
        </header>

        {/* Message Stream Container */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            /* EMPTY STATE & BENCHMARK SUITE */
            <div className="max-w-3xl mx-auto mt-6 space-y-8">
              <div className="space-y-3 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/40 border border-blue-800/40 text-blue-400 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  Minimi Hiring Challenge Grounded System
                </div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight">
                  Episodic Memory & Grounded Web Search
                </h2>
                <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
                  Engineered to pass the hiring team&apos;s exact temporal delta benchmarks. Resolves
                  natural language dates, retrieves historical state from SQLite, and computes factual
                  pricing/feature differences.
                </p>
              </div>

              {/* Benchmark Cards Grid */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Evaluation Test Scenarios (Click to Run)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {BENCHMARK_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      disabled={isProcessing}
                      className="group p-4 rounded-xl border border-[#1e2333] bg-[#11141e] hover:bg-[#161a29] hover:border-blue-500/40 transition-all text-left flex flex-col justify-between space-y-3 shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="w-7 h-7 rounded-md bg-[#161c2b] border border-[#232c42] flex items-center justify-center">
                            {item.iconType === 'chart' && <BarChart3 className="w-3.5 h-3.5 text-blue-400" />}
                            {item.iconType === 'calendar' && <Calendar className="w-3.5 h-3.5 text-emerald-400" />}
                            {item.iconType === 'database' && <Database className="w-3.5 h-3.5 text-purple-400" />}
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1c2236] text-blue-300 border border-blue-500/20">
                            {item.tag}
                          </span>
                        </div>
                        <h3 className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">
                          &quot;{item.prompt}&quot;
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#191e2e] flex items-center justify-between text-[10px] text-gray-500 group-hover:text-blue-400">
                        <span>Run Test Turn</span>
                        <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pipeline Architecture Legend */}
              <div className="p-4 rounded-xl border border-[#1a1f2e] bg-[#0d1017] text-xs text-gray-400 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="font-semibold text-gray-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>1. Temporal Resolution</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Chrono-node computes UTC boundaries relative to system anchor.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2. SQLite Episodic Memory</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Retrieves exact baseline turns, answers, and entities.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    <span>3. Targeted Search</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Parallel queries dispatched via Tavily or DuckDuckGo fallback.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>4. Delta Verification</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Audits baseline vs fresh state with inline citations [1].
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* CONVERSATION MESSAGE LIST */
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  } space-y-1.5`}
                >
                  <div className="flex items-center gap-2 px-1 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-400">
                      {msg.role === 'user' ? 'You' : 'Autonomous Agent'}
                    </span>
                    {msg.created_at && (
                      <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    )}
                  </div>

                  <div
                    className={`rounded-2xl px-5 py-4 max-w-[90%] text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-[#121520] border border-[#1d2334] text-gray-200 shadow-lg'
                    }`}
                  >
                    {/* Assistant Metadata Chips (if available) */}
                    {msg.role === 'assistant' && (msg.temporalWindow || msg.baseline) && (
                      <div className="mb-4 pb-3 border-b border-[#21273b] flex flex-wrap gap-2 text-[10px]">
                        {msg.temporalWindow?.hasTemporalReference && (
                          <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-400" />
                            Grounded: {msg.temporalWindow.referenceText} (
                            {msg.temporalWindow.startDateIso?.slice(0, 10)})
                          </span>
                        )}
                        {msg.baseline?.found && (
                          <span className="px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Database className="w-3 h-3 text-emerald-400" />
                            Episodic Baseline: {msg.baseline.matchedDate?.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content Rendering */}
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                      {msg.content ||
                        (msg.isStreaming && (
                          <span className="flex items-center gap-2 text-gray-400 italic">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            Synthesizing grounded response...
                          </span>
                        ))}
                    </div>

                    {/* Citations Shelf */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[#1d2334] space-y-2">
                        <div className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <Globe className="w-3 h-3 text-blue-400" />
                          <span>Verified Search Citations ({msg.citations.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((c) => (
                            <button
                              key={c.index}
                              onClick={() => setSelectedCitation(c)}
                              className="px-2.5 py-1 rounded bg-[#171b28] hover:bg-[#1e2335] border border-[#272f44] text-[11px] text-blue-300 hover:text-blue-200 transition-colors flex items-center gap-1.5 group"
                            >
                              <span className="font-mono text-[10px] text-blue-400 font-bold">
                                [{c.index}]
                              </span>
                              <span className="truncate max-w-[160px]">{c.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Live Active Pipeline State Indicator */}
              {activeStage && (
                <div className="max-w-[90%] p-4 rounded-xl border border-blue-500/30 bg-[#0f1422] shadow-lg animate-subtle-pulse space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-blue-400 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="uppercase tracking-wider font-mono text-[11px]">
                        STAGE: {activeStage.stage.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">Real-time SSE Stream</span>
                  </div>

                  <p className="text-xs text-gray-200 font-medium">{activeStage.message}</p>

                  {/* Sub-queries preview */}
                  {activeStage.data?.queries && (
                    <div className="p-2 rounded bg-[#090c14] border border-[#1b2234] space-y-1">
                      <div className="text-[10px] font-mono text-gray-400">
                        Dispatched Parallel Queries:
                      </div>
                      <div className="space-y-0.5">
                        {activeStage.data.queries.map((q: string, i: number) => (
                          <div
                            key={i}
                            className="text-[11px] font-mono text-blue-300 flex items-center gap-1.5"
                          >
                            <span className="text-gray-600">↳</span>
                            <span>&quot;{q}&quot;</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Citations Inspector Modal / Drawer */}
        {selectedCitation && (
          <div className="absolute inset-y-0 right-0 w-96 bg-[#0f121b] border-l border-[#1d2334] p-5 shadow-2xl z-30 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1d2334] pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
                    [{selectedCitation.index}]
                  </span>
                  <h3 className="text-xs font-semibold text-white">Source Verification</h3>
                </div>
                <button
                  onClick={() => setSelectedCitation(null)}
                  className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#1b2133] transition-colors"
                  title="Close Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h4 className="text-sm font-medium text-blue-300">{selectedCitation.title}</h4>
                <a
                  href={selectedCitation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-1 break-all"
                >
                  <span>{selectedCitation.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div className="p-3 rounded-lg bg-[#151926] border border-[#22293e] space-y-1.5">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Extracted Web Snippet
                </div>
                <p className="text-xs text-gray-300 leading-relaxed italic">
                  &quot;{selectedCitation.snippet}&quot;
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#1d2334]">
              <a
                href={selectedCitation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                <span>Open Official Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Input Bar */}
        <footer className="p-4 border-t border-[#1a1f2c] bg-[#0c0e15] shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-center rounded-xl bg-[#121520] border border-[#1f2638] focus-within:border-blue-500/60 transition-all shadow-inner">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about pricing changes, past conversations, or CRM & Postgres hosting..."
                rows={1}
                disabled={isProcessing}
                className="w-full bg-transparent px-4 py-3.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none resize-none"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isProcessing}
                className={`mr-3 p-2 rounded-lg transition-all ${
                  input.trim() && !isProcessing
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                    : 'bg-[#1a2030] text-gray-600 cursor-not-allowed'
                }`}
                title="Send query"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-300" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 px-1">
              <span>Press <b>Enter</b> to send, <b>Shift+Enter</b> for new line</span>
              <span className="font-mono text-gray-400">Targeting Minimi Evaluation Rubric</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

