import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, Card, Badge } from '../index';

describe('ui primitives smoke', () => {
  it('mounts a Button with its label', () => {
    render(<Button>Cast Chart</Button>);
    expect(screen.getByRole('button', { name: 'Cast Chart' })).toBeTruthy();
  });

  it('mounts a Card with a title and children', () => {
    render(
      <Card title="Lagna">
        <p>Body content</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Lagna' })).toBeTruthy();
    expect(screen.getByText('Body content')).toBeTruthy();
  });

  it('mounts a Badge with its text', () => {
    render(<Badge variant="brass">Exalted</Badge>);
    expect(screen.getByText('Exalted')).toBeTruthy();
  });
});
