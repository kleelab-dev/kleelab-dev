import { resolveTheme, type KleeLabDocument } from '@/lib/document';
import { buildOutline, PALETTE_NAMES, sectionCatalogue, styleTokens, type Outline } from '@/lib/editor/outline';
import { apiService } from '@/services/api';
import type { AiEditOperation } from '@/types/api';

/**
 * One turn of the conversation.
 *
 * All of the request-shaping lives here rather than in the component, because the
 * component should be about what the author sees, and this is about what the
 * model is told. Every list the model is given comes from a function that reads
 * the document model — the outline, the catalogue, the style tokens — so there is
 * no chance of the prompt describing a page or a value that no longer exists.
 */

export interface TurnResult {
  operations: AiEditOperation[];
  summary: string;
  /**
   * Whether anything was changed. `question` means the assistant is still talking —
   * answering, or asking — and the interface shows it as something to reply to
   * rather than as a report.
   */
  kind: 'change' | 'question';
  /** Suggested replies, when it asked something. */
  choices: string[];
  /** The outline the model was shown. Its `textKeys` must be reused when applying. */
  outline: Outline;
  model: string;
}

export async function askForChanges({
  document,
  instruction,
  pageTitle,
  history,
}: {
  document: KleeLabDocument;
  instruction: string;
  pageTitle: string;
  history: string[];
}): Promise<TurnResult> {
  const outline = buildOutline(document.root);

  const response = await apiService.editSite({
    instruction,
    page_title: pageTitle,
    outline: outline.nodes,
    theme: resolveTheme(document.tokens),
    palettes: [...PALETTE_NAMES],
    sections: sectionCatalogue(),
    style_tokens: styleTokens(),
    history: recentHistory(history),
  });

  return {
    operations: response.operations,
    summary: response.summary,
    kind: response.kind,
    choices: response.choices,
    outline,
    model: response.model,
  };
}

/**
 * The last few turns, condensed.
 *
 * Enough for "do that again but smaller" to have a referent, and short enough that
 * a long conversation does not slowly price itself out — the history is resent
 * every turn, so its cost is paid repeatedly.
 */
function recentHistory(history: string[]): string[] {
  return history.slice(-6).map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));
}

/**
 * One turn, as the model is shown it.
 *
 * Marking the assistant's own questions is what makes "yes" legible. The model could
 * already see that it had asked something — the text was in the history — but nothing
 * distinguished a question from a report, so when the owner answered it, the model
 * responded by trying to make the change it had just asked about. Reading the answer
 * to your own question is a different act from making a change, and the prompt needs
 * both the label and a rule for it.
 */
export function describeTurnForModel(turn: {
  role: 'user' | 'assistant';
  kind?: 'change' | 'question';
  text: string;
}): string {
  if (turn.role === 'user') return `They said: ${turn.text}`;
  if (turn.kind === 'question') return `You asked: ${turn.text}`;
  return `You changed: ${turn.text}`;
}
