# "Built by KleeLab" footer credit

Put this credit in the footer of every client site we hand over, once the client
agrees (ask during the proposal, not at handover). It sends people who like the
site to us, and each link from a real, relevant site helps kleelab.com rank.

## Rules

- **Link to the project's portfolio page** (`https://www.kleelab.com/portfolio/<slug>`)
  once it is published, and to `https://www.kleelab.com/` until then.
- **Use the brand name as the link text**: "KleeLab". Do not use keyword text such as
  "best web design agency". Search engines treat keyword-stuffed footer links as
  a link scheme, but a plain brand credit is normal practice.
- **Keep it small and quiet**: one line, the same colour as the other footer text. The
  client's brand comes first.
- **No `nofollow`**, and no tracking parameters in the link: the canonical address
  is what earns the credit.
- If a client later asks for it to come off, take it off.

## Plain HTML

```html
<p class="built-by">
  Site by <a href="https://www.kleelab.com/portfolio/PROJECT-SLUG">KleeLab</a>
</p>
```

## React / Next.js

```tsx
/** The studio credit in the footer. Swap in this project's portfolio slug once it is published. */
export function BuiltBy({ slug }: { slug?: string }) {
  const href = slug ? `https://www.kleelab.com/portfolio/${slug}` : 'https://www.kleelab.com/';
  return (
    <p className="text-xs opacity-70">
      Site by{' '}
      <a href={href} className="underline-offset-2 hover:underline">
        KleeLab
      </a>
    </p>
  );
}
```

## Handover checklist

1. Credit is in the footer on every page, and the link opens.
2. The portfolio entry is published, and the credit points at it.
3. The client has seen it and is happy with it.
