import * as chrono from 'chrono-node';

export interface TemporalWindow {
  hasTemporalReference: boolean;
  referenceText?: string;
  startDate?: Date;
  endDate?: Date;
  startDateIso?: string;
  endDateIso?: string;
  isPastQuery: boolean;
  isComparativeQuery: boolean;
  referenceAnchor: string;
}

/**
 * Resolves natural language date references (e.g., "Monday", "3 November", "last Tuesday")
 * into precise UTC date boundaries relative to the reference timestamp.
 */
export function parseTemporalGrounding(
  query: string,
  referenceDate: Date = new Date()
): TemporalWindow {
  const normalizedQuery = query.trim();

  // Pattern checks for comparative / retrospective queries
  const pastIndicators = [
    /\b(last|past|yesterday|ago|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday)\b/i,
    /\bwhat did i (ask|say|tell)\b/i,
    /\bwe (shortlisted|discussed|picked|chose|agreed|looked at)\b/i,
    /\byou (recommended|answered|said|told me)\b/i,
  ];

  const comparativeIndicators = [
    /\bchanged?\s+(pricing|since|features?|plans?)\b/i,
    /\bhas\s+(any|anything)\s+changed\b/i,
    /\b(still\s+correct|still\s+valid|still\s+true|outdated)\b/i,
    /\bshipped\s+something\s+big\b/i,
    /\bupdates?\s+since\b/i,
    /\bsince\s+then\b/i,
  ];

  const isPastQuery = pastIndicators.some((regex) => regex.test(normalizedQuery));
  const isComparativeQuery = comparativeIndicators.some((regex) => regex.test(normalizedQuery));

  // Use chrono-node with forwardDate: false to resolve backward in time for relative days
  const parsedResults = chrono.parse(normalizedQuery, referenceDate, {
    forwardDate: false,
  });

  if (parsedResults.length === 0) {
    // Secondary regex check for specific explicit formats if chrono missed any
    const novRegex = /\b(\d{1,2})\s+(nov|november)\b/i;
    const novMatch = normalizedQuery.match(novRegex);
    if (novMatch) {
      const day = parseInt(novMatch[1], 10);
      const year = referenceDate.getFullYear();
      const start = new Date(Date.UTC(year, 10, day, 0, 0, 0, 0)); // month 10 = Nov
      const end = new Date(Date.UTC(year, 10, day, 23, 59, 59, 999));
      return {
        hasTemporalReference: true,
        referenceText: novMatch[0],
        startDate: start,
        endDate: end,
        startDateIso: start.toISOString(),
        endDateIso: end.toISOString(),
        isPastQuery: true,
        isComparativeQuery,
        referenceAnchor: referenceDate.toISOString(),
      };
    }

    return {
      hasTemporalReference: false,
      isPastQuery,
      isComparativeQuery,
      referenceAnchor: referenceDate.toISOString(),
    };
  }

  // Take the primary matched date component
  const primaryMatch = parsedResults[0];
  const matchedDate = primaryMatch.start.date();

  // Create full UTC calendar day boundary for that target date
  const startOfDay = new Date(
    Date.UTC(
      matchedDate.getUTCFullYear(),
      matchedDate.getUTCMonth(),
      matchedDate.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const endOfDay = new Date(
    Date.UTC(
      matchedDate.getUTCFullYear(),
      matchedDate.getUTCMonth(),
      matchedDate.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );

  return {
    hasTemporalReference: true,
    referenceText: primaryMatch.text,
    startDate: startOfDay,
    endDate: endOfDay,
    startDateIso: startOfDay.toISOString(),
    endDateIso: endOfDay.toISOString(),
    isPastQuery: true,
    isComparativeQuery,
    referenceAnchor: referenceDate.toISOString(),
  };
}

