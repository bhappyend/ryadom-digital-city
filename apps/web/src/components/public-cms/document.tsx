import type { CmsDocument } from '@ryadom/accounts-types';
import { CmsImage } from './media';

export function CmsDocumentBody({ document }: { document: CmsDocument }) {
  if (document.kind === 'section') return <>{document.blocks.map((block, i) => {
    if (block.kind === 'heading') return <h2 key={i}>{block.text}</h2>;
    if (block.kind === 'paragraph') return <p key={i} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{block.text}</p>;
    if (block.kind === 'link') return <p key={i}><a href={block.link.url} target="_blank" rel="noopener noreferrer">{block.link.label}</a></p>;
    return <figure key={i} style={{ marginInline: 0 }}><CmsImage asset={block.asset} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
  })}</>;
  if (document.kind === 'faq') return <>{document.items.map((item, i) => <details key={i}><summary>{item.question}</summary><p style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{item.answer}</p></details>)}</>;
  if (document.kind === 'contacts') return <>{document.links.map((link, i) => <p key={i}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></p>)}</>;
  if (document.kind === 'legal') return <><p className="muted">Версия документа: {document.documentVersion}</p>{document.paragraphs.map((p, i) => <p key={i} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{p}</p>)}</>;
  return null;
}
