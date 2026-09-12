'use client';

/* eslint-disable @next/next/no-img-element -- user-authored content may reference
   arbitrary image hosts, and next/image requires an allowlist in next.config.
   The R2 media manager will move uploads to a known host. */
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { nodeClasses, type Node, type NodeType } from '@/lib/document';
import { CartButton } from '@/components/storefront/CartButton';
import { ProductGrid } from '@/components/storefront/ProductGrid';

/**
 * The shared render registry.
 *
 * Every node type maps to exactly one React component. Both the editor canvas
 * and the published site render through `NodeRenderer`, so a page cannot look
 * different in the builder than it does in production.
 */

export type NodeComponentProps = {
  node: Node;
  children?: ReactNode;
};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Only fall back to default padding when the author has set none. */
function sectionDefaults(node: Node): string {
  const style = node.style ?? {};
  const hasPadding = Boolean(style.padding || style.paddingX || style.paddingY);
  return hasPadding ? '' : 'px-6 py-12 md:px-10';
}

function PageNode({ node, children }: NodeComponentProps) {
  return <div className={clsx('min-h-full bg-paper text-ink', nodeClasses(node))}>{children}</div>;
}

function SectionNode({ node, children }: NodeComponentProps) {
  return (
    <section className={clsx(sectionDefaults(node), nodeClasses(node))}>{children}</section>
  );
}

function ContainerNode({ node, children }: NodeComponentProps) {
  return <div className={clsx('mx-auto w-full max-w-4xl', nodeClasses(node))}>{children}</div>;
}

const GRID_COLUMN_CLASSES: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

function GridNode({ node, children }: NodeComponentProps) {
  const columns = Math.min(Math.max(num(node.props.columns, 1), 1), 4);
  return (
    <div className={clsx('grid grid-cols-1 gap-6', GRID_COLUMN_CLASSES[columns], nodeClasses(node))}>
      {children}
    </div>
  );
}

const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;
const HEADING_SIZES: Record<number, string> = {
  1: 'text-4xl md:text-5xl',
  2: 'text-3xl',
  3: 'text-2xl',
  4: 'text-xl',
};

function HeadingNode({ node }: NodeComponentProps) {
  const level = Math.min(Math.max(num(node.props.level, 2), 1), 4);
  const Tag = HEADING_TAGS[level as keyof typeof HEADING_TAGS] ?? 'h2';
  return (
    <Tag className={clsx('font-serif tracking-[-0.03em]', HEADING_SIZES[level], nodeClasses(node))}>
      {text(node.props.text)}
    </Tag>
  );
}

function TextNode({ node }: NodeComponentProps) {
  return (
    <p className={clsx('text-sm leading-6 text-muted', nodeClasses(node))}>{text(node.props.text)}</p>
  );
}

function ImageNode({ node }: NodeComponentProps) {
  const src = text(node.props.src);
  if (!src) return null;
  return <img src={src} alt={text(node.props.alt)} className={clsx('w-full', nodeClasses(node))} />;
}

function ButtonNode({ node }: NodeComponentProps) {
  const href = text(node.props.href, '#');
  return (
    <a
      href={href}
      className={clsx(
        'inline-flex items-center rounded-full bg-accent px-5 py-3 text-xs font-bold text-white hover:bg-accent-dark',
        nodeClasses(node),
      )}
    >
      {text(node.props.label, 'Learn more')}
    </a>
  );
}

function LinkNode({ node }: NodeComponentProps) {
  return (
    <a href={text(node.props.href, '#')} className={clsx('text-accent underline', nodeClasses(node))}>
      {text(node.props.label, 'Link')}
    </a>
  );
}

function DividerNode({ node }: NodeComponentProps) {
  return <hr className={clsx('my-6 border-line', nodeClasses(node))} />;
}

const SPACER_HEIGHTS: Record<string, string> = {
  none: 'h-0',
  xs: 'h-2',
  sm: 'h-4',
  md: 'h-8',
  lg: 'h-16',
  xl: 'h-24',
};

function SpacerNode({ node }: NodeComponentProps) {
  const size = text(node.props.size, 'md');
  return <div aria-hidden className={clsx(SPACER_HEIGHTS[size] ?? 'h-8', nodeClasses(node))} />;
}

function ListNode({ node, children }: NodeComponentProps) {
  const items = stringList(node.props.items);
  const ordered = node.props.ordered === true;
  const Tag = ordered ? 'ol' : 'ul';
  const body = items.map((item, index) => (
    <li key={`${node.id}-item-${index}`} className="text-sm leading-6 text-muted">
      {item}
    </li>
  ));
  return (
    <Tag className={clsx('ml-5 list-outside space-y-1', ordered ? 'list-decimal' : 'list-disc', nodeClasses(node))}>
      {body}
      {children}
    </Tag>
  );
}

function FormNode({ node, children }: NodeComponentProps) {
  const fields = records(node.props.fields);
  return (
    <form className={clsx('grid gap-3', nodeClasses(node))} onSubmit={(event) => event.preventDefault()}>
      {fields.map((field, index) => (
        <label key={`${node.id}-field-${index}`} className="grid gap-1 text-xs font-bold text-muted">
          {text(field.label, text(field.name, `Field ${index + 1}`))}
          <input
            name={text(field.name)}
            type={text(field.type, 'text')}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent"
          />
        </label>
      ))}
      <button type="submit" className="mt-1 inline-flex w-fit rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-white">
        Send
      </button>
      {children}
    </form>
  );
}

function InputNode({ node }: NodeComponentProps) {
  return (
    <label className={clsx('grid gap-1 text-xs font-bold text-muted', nodeClasses(node))}>
      {text(node.props.label, 'Field')}
      <input
        name={text(node.props.name)}
        type={text(node.props.type, 'text')}
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

function NavNode({ node }: NodeComponentProps) {
  const links = records(node.props.links);
  return (
    <nav className={clsx('flex items-center justify-between gap-6 border-b border-line px-6 py-4', nodeClasses(node))}>
      <span className="text-sm font-bold">{text(node.props.brand, 'KleeLab')}</span>
      <div className="flex items-center gap-5 text-xs font-bold text-muted">
        {links.map((link, index) => (
          <a key={`${node.id}-link-${index}`} href={text(link.href, '#')}>
            {text(link.label, 'Link')}
          </a>
        ))}
      </div>
    </nav>
  );
}

function FooterNode({ node, children }: NodeComponentProps) {
  return (
    <footer className={clsx('border-t border-line px-6 py-8 text-xs text-muted', nodeClasses(node))}>
      {children}
      {text(node.props.text)}
    </footer>
  );
}

/**
 * Raw HTML is rendered as text on purpose. Injecting author HTML into a
 * published page is stored XSS unless it is sanitised first, and no sanitizer
 * is wired up yet. Sanitised embeds are tracked for a later phase.
 */
function HtmlNode({ node }: NodeComponentProps) {
  return <div className={clsx('whitespace-pre-wrap text-xs text-muted', nodeClasses(node))}>{text(node.props.html)}</div>;
}

function ProductGridNode({ node }: NodeComponentProps) {
  return (
    <div className={nodeClasses(node)}>
      <ProductGrid
        columns={num(node.props.columns, 3)}
        showPrices={node.props.showPrices !== false}
      />
    </div>
  );
}

function CartButtonNode({ node }: NodeComponentProps) {
  return (
    <div className={nodeClasses(node)}>
      <CartButton label={text(node.props.label, 'Cart')} />
    </div>
  );
}

/** Tolerant fallback so unknown or future node types never crash a page. */
function UnknownNode({ node, children }: NodeComponentProps) {
  return (
    <div className={clsx('rounded border border-dashed border-line p-3 text-xs text-muted', nodeClasses(node))}>
      Unsupported block: {node.type}
      {children}
    </div>
  );
}

/** The registry. Keyed by node type; editor tooling reads this for its palette. */
export const NODE_REGISTRY: Record<NodeType, React.ComponentType<NodeComponentProps>> = {
  page: PageNode,
  section: SectionNode,
  container: ContainerNode,
  grid: GridNode,
  heading: HeadingNode,
  text: TextNode,
  image: ImageNode,
  button: ButtonNode,
  link: LinkNode,
  divider: DividerNode,
  spacer: SpacerNode,
  list: ListNode,
  form: FormNode,
  input: InputNode,
  nav: NavNode,
  footer: FooterNode,
  html: HtmlNode,
  product_grid: ProductGridNode,
  cart_button: CartButtonNode,
};

export function NodeRenderer({ node }: { node: Node }) {
  const Component = NODE_REGISTRY[node.type] ?? UnknownNode;
  return (
    <Component node={node}>
      {node.children?.map((child) => <NodeRenderer key={child.id} node={child} />)}
    </Component>
  );
}

export function DocumentRenderer({ document }: { document: { root: Node } }) {
  return <NodeRenderer node={document.root} />;
}
