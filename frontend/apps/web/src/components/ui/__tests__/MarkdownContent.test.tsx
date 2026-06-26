import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownContent, stripMarkdown } from '../MarkdownContent';

function rootClasses(container: HTMLElement): string {
  // The outermost div carries the prose/typography classes.
  const root = container.firstElementChild as HTMLElement;
  return root.className;
}

describe('MarkdownContent typography', () => {
  it('uses a constrained readable measure, NOT max-w-none', () => {
    const { container } = render(<MarkdownContent content="Hello world" />);
    const cls = rootClasses(container);
    expect(cls).not.toContain('max-w-none');
    // A measure cap is applied (~60-72ch via a max-w-* utility).
    expect(cls).toMatch(/max-w-\[?\d/);
  });

  it('renders at base prose size (16px), not the crushed prose-sm (14px)', () => {
    const { container } = render(<MarkdownContent content="Hello world" />);
    const cls = rootClasses(container);
    // Base `prose` is present; the squashing `prose-sm` is gone in default mode.
    expect(cls).toContain('prose');
    expect(cls).not.toContain('prose-sm');
  });

  it('applies a relaxed line-height to paragraphs', () => {
    const { container } = render(<MarkdownContent content="Hello world" />);
    const cls = rootClasses(container);
    // The 1.75 relaxed leading token is wired into paragraph rhythm.
    expect(cls).toMatch(/prose-p:leading-(\[1\.75\]|loose)/);
  });

  it('actually renders markdown to HTML (paragraph element present)', () => {
    const { container } = render(<MarkdownContent content="Hello **bold** world" />);
    expect(container.querySelector('p')).toBeTruthy();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  it('compact mode stays readable (still base prose, tighter rhythm)', () => {
    const { container } = render(<MarkdownContent content="Hello" compact />);
    const cls = rootClasses(container);
    expect(cls).not.toContain('prose-sm');
  });
});

describe('stripMarkdown', () => {
  it('removes bold, headers and links for a clean preview line', () => {
    expect(stripMarkdown('## Title\n**Bold** and [link](http://x)')).toBe('Title Bold and link');
  });
});
