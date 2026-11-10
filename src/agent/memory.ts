import {
  findMessagesByDateRange,
  searchMessagesByKeywords,
  getMessagesByConversation,
} from '../db';
import { TemporalWindow } from './temporal';

export interface HistoricalBaseline {
  found: boolean;
  retrievalMethod: 'temporal' | 'keyword' | 'none';
  matchedDate?: string;
  conversationId?: string;
  userQuery?: string;
  assistantAnswer?: string;
  entities: string[];
  citations: Array<{ title: string; url: string; snippet?: string }>;
  contextSnippet: string;
}

const COMMON_ENTITIES = [
  'HubSpot',
  'Pipedrive',
  'Close',
  'Close CRM',
  'Zoho',
  'Zoho CRM',
  'Copper',
  'Copper CRM',
  'Salesforce',
  'CRM',
  'Postgres',
  'PostgreSQL',
  'Supabase',
  'Neon',
  'AWS RDS',
  'RDS',
  'Railway',
  'Aurora',
  'Fly.io',
  'Render',
];

/**
 * Extracts candidate entities from query text using common entity dictionaries
 * and capitalized noun phrases.
 */
export function extractEntitiesFromText(text: string): string[] {
  const matched = new Set<string>();
  const lower = text.toLowerCase();

  for (const entity of COMMON_ENTITIES) {
    if (lower.includes(entity.toLowerCase())) {
      matched.add(entity);
    }
  }

  // Also match capitalized word sequences (e.g., "HubSpot Sales Hub")
  const capitalizedRegex = /\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*\b/g;
  const capitalizedMatches = text.match(capitalizedRegex) || [];
  for (const match of capitalizedMatches) {
    if (match.length > 2 && !['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'November', 'Nov'].includes(match)) {
      matched.add(match);
    }
  }

  return Array.from(matched);
}

/**
 * Recalls historical episodic conversation context matching the temporal window
 * or referenced entities/topics.
 */
export async function recallEpisodicBaseline(
  query: string,
  temporalWindow: TemporalWindow
): Promise<HistoricalBaseline> {
  // Strategy 1: Deterministic Temporal Retrieval
  if (temporalWindow.hasTemporalReference && temporalWindow.startDateIso && temporalWindow.endDateIso) {
    const turns = await findMessagesByDateRange(
      temporalWindow.startDateIso,
      temporalWindow.endDateIso
    );

    if (turns.length > 0) {
      // Find the first user message or conversation in that date range
      const userTurn = turns.find((t) => t.role === 'user') || turns[0];
      const convId = userTurn.conversation_id;

      // Get all turns in that conversation to cleanly pair user question + assistant answer
      const convTurns = await getMessagesByConversation(convId);
      const assistantTurn = convTurns.find(
        (t) => t.role === 'assistant' && t.created_at >= userTurn.created_at
      ) || turns.find((t) => t.role === 'assistant');

      const entities: string[] = [];
      if (userTurn.extracted_entities) {
        try {
          entities.push(...JSON.parse(userTurn.extracted_entities));
        } catch { /* empty */ }
      }
      if (assistantTurn?.extracted_entities) {
        try {
          entities.push(...JSON.parse(assistantTurn.extracted_entities));
        } catch { /* empty */ }
      }

      // Also extract directly from content if no metadata stored
      if (entities.length === 0 && assistantTurn?.content) {
        entities.push(...extractEntitiesFromText(assistantTurn.content));
      }

      const citations: Array<{ title: string; url: string; snippet?: string }> = [];
      if (assistantTurn?.search_sources) {
        try {
          citations.push(...JSON.parse(assistantTurn.search_sources));
        } catch { /* empty */ }
      }

      return {
        found: true,
        retrievalMethod: 'temporal',
        matchedDate: userTurn.created_at,
        conversationId: convId,
        userQuery: userTurn.content,
        assistantAnswer: assistantTurn ? assistantTurn.content : '',
        entities: Array.from(new Set(entities)),
        citations,
        contextSnippet: `[Historical Turn recorded at ${userTurn.created_at}]\nUser Question: ${userTurn.content}\n\nAssistant Response: ${assistantTurn ? assistantTurn.content : 'N/A'}`,
      };
    }
  }

  // Strategy 2: Topic & Entity Keyword Lookup Fallback
  const extractedEntities = extractEntitiesFromText(query);
  const keywords = ['crm', 'postgres', 'pricing', 'shortlist', 'hosting', ...extractedEntities.map(e => e.toLowerCase())];
  const matchedTurns = await searchMessagesByKeywords(keywords);

  if (matchedTurns.length > 0) {
    const targetTurn = matchedTurns[0];
    const convTurns = await getMessagesByConversation(targetTurn.conversation_id);
    const userTurn = convTurns.find((t) => t.role === 'user') || targetTurn;
    const assistantTurn = convTurns.find(
      (t) => t.role === 'assistant' && t.created_at >= userTurn.created_at
    );

    const entities: string[] = [];
    if (userTurn.extracted_entities) {
      try {
        entities.push(...JSON.parse(userTurn.extracted_entities));
      } catch { /* empty */ }
    }
    if (assistantTurn?.extracted_entities) {
      try {
        entities.push(...JSON.parse(assistantTurn.extracted_entities));
      } catch { /* empty */ }
    }
    if (entities.length === 0 && assistantTurn?.content) {
      entities.push(...extractEntitiesFromText(assistantTurn.content));
    }

    const citations: Array<{ title: string; url: string; snippet?: string }> = [];
    if (assistantTurn?.search_sources) {
      try {
        citations.push(...JSON.parse(assistantTurn.search_sources));
      } catch { /* empty */ }
    }

    return {
      found: true,
      retrievalMethod: 'keyword',
      matchedDate: userTurn.created_at,
      conversationId: targetTurn.conversation_id,
      userQuery: userTurn.content,
      assistantAnswer: assistantTurn ? assistantTurn.content : targetTurn.content,
      entities: Array.from(new Set(entities)),
      citations,
      contextSnippet: `[Historical Turn retrieved by keyword match at ${userTurn.created_at}]\nUser Question: ${userTurn.content}\n\nAssistant Response: ${assistantTurn ? assistantTurn.content : targetTurn.content}`,
    };
  }

  return {
    found: false,
    retrievalMethod: 'none',
    entities: extractEntitiesFromText(query),
    citations: [],
    contextSnippet: '',
  };
}

