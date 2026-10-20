import type { ContentBlock } from '@animalabs/membrane';

/**
 * Fixed, provider-facing gap text. Deliberately neutral: no refusal category,
 * no classifier vocabulary (that would ship the trigger's own words into every
 * later request). The category lives only in `classifierGap` metadata and
 * receipts; the id points there.
 */
export function classifierGapContent(summaryId: string): ContentBlock[] {
  return [{
    type: 'text',
    text: `[Context Manager record: a span here is preserved unsummarized, pending review — receipt ${summaryId}.]`,
  }];
}
