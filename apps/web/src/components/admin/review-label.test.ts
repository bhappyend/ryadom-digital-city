import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
// Render the actual already-loaded drawer state. Its text must not become part
// of the label: a saved review is dynamic content, not the field's name.
function renderLoadedEditor(allowed: boolean) {
  const review = { text: 'Original saved review content', authorId: 'original-author', version: 1, status: 'pending' };
  const states = [{ review, originalText: review.text, corrections: [], hasMoreCorrections: false }, true, '', false, null];
  const code = ts.transpileModule(readFileSync(new URL('./publishing.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as { ReviewEditor: React.ComponentType<any> } };
  const replacements: Record<string, unknown> = {
    react: { ...React, useId: () => 'review-correction-label', useState: () => [states.shift(), () => {}] },
    './dialog': { Drawer: ({ children }: { children: React.ReactNode }) => React.createElement('div', { role: 'dialog' }, children) },
    './forms': { Reason: () => null },
    '@/lib/admin/api': {},
  };
  new Function('require', 'module', 'exports', code)((id: string) => replacements[id] ?? nativeRequire(id), module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.ReviewEditor, { item: { id: 'review', kind: 'place-review', review }, can: (permission: string) => permission === 'reviews:correct' && allowed, done: () => {} }));
}

it('keeps the correction field labelled independently of its initialized review text', () => {
  const html = renderLoadedEditor(true);
  expect(html).toContain('<label for="review-correction-label">Исправленный текст</label>');
  expect(html).toMatch(/<textarea[^>]*id="review-correction-label"[^>]*name="text"/);
  expect(html).toContain('>Original saved review content</textarea>');
});

it('gives claim decision, verification method and listing decision independent explicit labels', () => {
  // Keep option captions out of the form control's label text. Render both
  // actual decision forms with their real policy helpers, not copied markup.
  const source = readFileSync(new URL('./business-verification/index.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source + '\nexport { ClaimReview, ListingReview };', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const item = { listing: { id: 'listing', version: 1, placementState: 'pending-review', ownershipState: 'verified', paymentState: 'manually-confirmed' }, businessName: 'Actual business', currentAgreement: {}, currentQuote: {} };
  const policy = { claimDecisions: () => ['verify', 'reject'], verificationMethods: { independent_registry: 'Независимый реестр' }, listingApprovalGaps: () => [] };
  for (const name of ['ClaimReview', 'ListingReview']) {
    const states: unknown[] = name === 'ListingReview' ? [item, 0, false, false, false, '', ''] : ['verify', '', false, '', false];
    const module = { exports: {} as Record<string, React.ComponentType<any>> };
    const replacements: Record<string, unknown> = { react: { ...React, useId: () => 'form-id', useEffect: () => {}, useRef: () => ({ current: false }), useState: () => [states.shift(), () => {}] }, '@/lib/admin/business-verification/policy': policy, '@/lib/admin/api': {}, '../dialog': { Drawer: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }, './verification.module.css': {} };
    new Function('require', 'module', 'exports', code)((id: string) => replacements[id] ?? nativeRequire(id), module, module.exports);
    const html = renderToStaticMarkup(React.createElement(module.exports[name]!, { item: { claim: { id: 'claim', version: 1 }, evidenceText: 'Independent actual evidence' }, actorId: 'moderator', listingId: 'listing', can: () => true, close: () => {}, done: () => {} }));
    expect(html).toContain('<label for="form-id-decision">Решение</label><select id="form-id-decision"');
    if (name === 'ClaimReview') expect(html).toContain('<label for="form-id-method">Фактический способ проверки</label><select id="form-id-method"');
    expect(html).toContain('id="form-id-note"');
  }
});
it('does not expose the correction form without its permission', () => {
  const html = renderLoadedEditor(false);
  expect(html).toContain('Original saved review content');
  expect(html).not.toContain('<textarea');
});
