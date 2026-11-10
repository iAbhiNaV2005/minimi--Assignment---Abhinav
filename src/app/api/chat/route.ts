import { NextRequest } from 'next/server';
import { runAgentPipeline, AgentProgressEvent } from '@/agent/engine';
import { getConversation, getMessagesByConversation } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId, referenceDate } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const refDate = referenceDate ? new Date(referenceDate) : new Date();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: {
          type: 'status' | 'token' | 'citations' | 'done' | 'error';
          [key: string]: any;
        }) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          const result = await runAgentPipeline({
            userQuery: message,
            conversationId,
            referenceDate: refDate,
            onProgress: (prog: AgentProgressEvent) => {
              sendEvent({
                type: 'status',
                stage: prog.stage,
                message: prog.message,
                data: prog.data,
              });
            },
            onToken: (token: string) => {
              sendEvent({
                type: 'token',
                content: token,
              });
            },
          });

          // Send structured citations
          if (result.citations.length > 0) {
            sendEvent({
              type: 'citations',
              citations: result.citations,
            });
          }

          // Complete
          sendEvent({
            type: 'done',
            messageId: result.messageId,
            conversationId: result.conversationId,
            temporalWindow: result.temporalWindow,
            baseline: {
              found: result.baseline.found,
              matchedDate: result.baseline.matchedDate,
              entities: result.baseline.entities,
            },
          });
        } catch (err: any) {
          console.error('[API/Chat] Pipeline execution error:', err);
          sendEvent({
            type: 'error',
            message: err?.message || 'An unexpected error occurred during pipeline execution.',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'conversationId parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const conv = await getConversation(conversationId);
  const messages = await getMessagesByConversation(conversationId);

  return new Response(
    JSON.stringify({
      conversation: conv,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        search_queries: m.search_queries ? JSON.parse(m.search_queries) : [],
        search_sources: m.search_sources ? JSON.parse(m.search_sources) : [],
        extracted_entities: m.extracted_entities ? JSON.parse(m.extracted_entities) : [],
      })),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

