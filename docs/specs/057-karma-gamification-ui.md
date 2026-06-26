# Spec 057: Karma Gamification UI

**Status:** Draft
**Created:** 2025-01-22
**Priority:** P2 MEDIUM
**Dependencies:** Spec 056 (API Endpoints)

## Goal

Design the frontend components for the Karma system: a visually engaging karma meter, opportunity panel, transaction history, and trend visualization. The UI should reinforce positive behavior without inducing anxiety.

---

## Current State

- Dashboard has cards: DashaSummaryCard, LifePhaseCard, KeyFocusCard
- Design system: Tailwind with custom colors (accent-gold, accent-purple, accent-blue)
- Component pattern: functional React with TypeScript interfaces
- State management: Zustand stores

---

## Requirements

### Must Have
- KarmaMeter: Animated balance display (0-120)
- OpportunityPanel: Dasha-conditioned action suggestions
- TransactionFeed: Recent karma changes with explanations
- KarmaInput: Text area for action submission

### Should Have
- TrendChart: 30-day balance visualization
- StreakDisplay: Current/longest streak
- CategoryBreakdown: Pie/bar chart of action types

### Out of Scope
- Leaderboards (explicitly excluded)
- Social sharing
- Push notifications
- Sound effects

---

## Design Principles

### 1. Positive Framing
- Show "karma cleared" not "karma lost"
- Use warm colors for progress, not red for low scores
- Celebrate streaks, don't punish breaks

### 2. Anxiety Reduction
- Smooth animations (no jarring changes)
- Encourage, don't guilt
- Show trends, not just current state

### 3. Clarity
- Explain every delta ("Why did this change?")
- Show Dasha context ("Saturn rewards patience")
- No hidden mechanics

---

## Component Specifications

### 1. KarmaMeter

The central visual element - an animated gauge showing current balance.

```tsx
// frontend/apps/web/src/components/karma/KarmaMeter.tsx

interface KarmaMeterProps {
  balance: number;        // 0-120
  floor: number;          // 0
  ceiling: number;        // 120
  trend: 'rising' | 'falling' | 'stable';
  health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  animate?: boolean;
}

/**
 * KarmaMeter - Visual karma balance display
 *
 * Design:
 * - Circular gauge with gradient fill
 * - Center number animates on change
 * - Ring color reflects health state
 * - Subtle pulse animation when rising
 *
 * Colors by health:
 * - excellent: accent-gold
 * - good: accent-purple
 * - fair: accent-blue
 * - poor: amber
 * - critical: orange (not red - avoid anxiety)
 */
export function KarmaMeter({
  balance,
  floor,
  ceiling,
  trend,
  health,
  animate = true,
}: KarmaMeterProps) {
  const percentage = ((balance - floor) / (ceiling - floor)) * 100;

  // Health-based colors (anxiety-conscious palette)
  const healthColors = {
    excellent: 'text-accent-gold stroke-accent-gold',
    good: 'text-accent-purple stroke-accent-purple',
    fair: 'text-accent-blue stroke-accent-blue',
    poor: 'text-amber-400 stroke-amber-400',
    critical: 'text-orange-400 stroke-orange-400',
  };

  const trendIcons = {
    rising: '↑',
    falling: '↓',
    stable: '→',
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* SVG Gauge */}
      <svg
        viewBox="0 0 120 120"
        className="w-48 h-48"
        aria-label={`Karma balance: ${balance.toFixed(1)}`}
      >
        {/* Background ring */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          strokeWidth="8"
          className="stroke-ui-border"
        />

        {/* Progress ring */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${percentage * 3.39} 339`}
          transform="rotate(-90 60 60)"
          className={`${healthColors[health]} transition-all duration-1000 ease-out`}
        />

        {/* Center text */}
        <text
          x="60"
          y="55"
          textAnchor="middle"
          className={`text-3xl font-bold ${healthColors[health].split(' ')[0]}`}
        >
          {balance.toFixed(0)}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          className="text-xs text-text-muted"
        >
          / {ceiling}
        </text>
      </svg>

      {/* Trend indicator */}
      <div className={`mt-2 flex items-center gap-1 text-sm ${
        trend === 'rising' ? 'text-green-400' :
        trend === 'falling' ? 'text-amber-400' :
        'text-text-muted'
      }`}>
        <span>{trendIcons[trend]}</span>
        <span className="capitalize">{trend}</span>
      </div>

      {/* Health label */}
      <div className={`mt-1 text-xs px-2 py-0.5 rounded-full ${
        health === 'excellent' ? 'bg-accent-gold/20 text-accent-gold' :
        health === 'good' ? 'bg-accent-purple/20 text-accent-purple' :
        health === 'fair' ? 'bg-accent-blue/20 text-accent-blue' :
        health === 'poor' ? 'bg-amber-400/20 text-amber-400' :
        'bg-orange-400/20 text-orange-400'
      }`}>
        {health.charAt(0).toUpperCase() + health.slice(1)}
      </div>
    </div>
  );
}
```

### 2. OpportunityPanel

Dasha-conditioned action suggestions.

```tsx
// frontend/apps/web/src/components/karma/OpportunityPanel.tsx

interface Opportunity {
  action_type: string;
  description: string;
  potential_delta: number;
  dasha_alignment: 'high' | 'medium' | 'low';
  example: string;
}

interface OpportunityPanelProps {
  currentDasha: string;
  dashaThemes: string[];
  opportunities: Opportunity[];
  warnings: string[];
}

/**
 * OpportunityPanel - Dasha-conditioned action suggestions
 *
 * Design:
 * - Header shows current Dasha with themes
 * - Cards for each opportunity with alignment indicator
 * - Collapsible warnings section
 */
export function OpportunityPanel({
  currentDasha,
  dashaThemes,
  opportunities,
  warnings,
}: OpportunityPanelProps) {
  const alignmentColors = {
    high: 'border-l-accent-gold',
    medium: 'border-l-accent-purple',
    low: 'border-l-accent-blue',
  };

  return (
    <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {currentDasha} Period Opportunities
        </h3>
        <div className="flex flex-wrap gap-2">
          {dashaThemes.map((theme) => (
            <span
              key={theme}
              className="px-2 py-0.5 bg-accent-gold/10 text-accent-gold text-xs rounded"
            >
              {theme}
            </span>
          ))}
        </div>
      </div>

      {/* Opportunities */}
      <div className="space-y-4 mb-6">
        {opportunities.map((opp, idx) => (
          <div
            key={idx}
            className={`bg-background-tertiary/50 border-l-4 ${alignmentColors[opp.dasha_alignment]} rounded-r-lg p-4`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-medium text-text-primary capitalize">
                {opp.action_type}
              </span>
              <span className="text-xs text-green-400">
                {opp.potential_delta.toFixed(1)} karma
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-2">
              {opp.description}
            </p>
            <p className="text-xs text-text-muted italic">
              Example: {opp.example}
            </p>
          </div>
        ))}
      </div>

      {/* Warnings (collapsible) */}
      {warnings.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-amber-400 hover:text-amber-300">
            {warnings.length} action{warnings.length > 1 ? 's' : ''} to avoid
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {warnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-text-muted list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

### 3. KarmaInput

Text area for submitting actions.

```tsx
// frontend/apps/web/src/components/karma/KarmaInput.tsx

interface KarmaInputProps {
  onSubmit: (message: string) => Promise<void>;
  isLoading: boolean;
  lastResult?: {
    category: string;
    delta: number;
    reasoning: string;
  };
}

/**
 * KarmaInput - Action submission form
 *
 * Design:
 * - Large text area with placeholder suggestions
 * - Submit button with loading state
 * - Result feedback below (category, delta, reasoning)
 */
export function KarmaInput({
  onSubmit,
  isLoading,
  lastResult,
}: KarmaInputProps) {
  const [message, setMessage] = useState('');

  const placeholders = [
    "I helped my neighbor with groceries today...",
    "I stayed calm when my boss criticized me unfairly...",
    "I finished a project I had been avoiding...",
    "I taught someone something new without expecting credit...",
  ];

  const [placeholder] = useState(
    placeholders[Math.floor(Math.random() * placeholders.length)]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) return;
    await onSubmit(message);
    setMessage('');
  };

  return (
    <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        Log an Action
      </h3>

      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full bg-background-tertiary border border-ui-border rounded-lg p-3 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-purple/50"
          disabled={isLoading}
        />

        <div className="mt-3 flex justify-between items-center">
          <span className="text-xs text-text-muted">
            {message.length}/2000 characters
          </span>
          <button
            type="submit"
            disabled={isLoading || message.length < 10}
            className="px-4 py-2 bg-accent-purple text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-purple/90 transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Submit'}
          </button>
        </div>
      </form>

      {/* Result feedback */}
      {lastResult && (
        <div className="mt-4 p-4 bg-background-tertiary/50 rounded-lg border-l-4 border-l-accent-gold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-text-primary capitalize">
              {lastResult.category}
            </span>
            <span className={`text-sm font-bold ${
              lastResult.delta < 0 ? 'text-green-400' : 'text-amber-400'
            }`}>
              {lastResult.delta < 0 ? '−' : '+'}{Math.abs(lastResult.delta).toFixed(1)}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {lastResult.reasoning}
          </p>
        </div>
      )}
    </div>
  );
}
```

### 4. TransactionFeed

Recent karma changes with explanations.

```tsx
// frontend/apps/web/src/components/karma/TransactionFeed.tsx

interface Transaction {
  transaction_id: string;
  created_at: string;
  delta: number;
  category: string | null;
  subcategory: string | null;
  authenticity: string | null;
  reasoning: string | null;
  dasha_lord: string | null;
}

interface TransactionFeedProps {
  transactions: Transaction[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

/**
 * TransactionFeed - Recent karma transaction history
 *
 * Design:
 * - Timeline-style list
 * - Color-coded by delta direction
 * - Expandable reasoning
 */
export function TransactionFeed({
  transactions,
  isLoading,
  hasMore,
  onLoadMore,
}: TransactionFeedProps) {
  return (
    <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        Recent Activity
      </h3>

      <div className="space-y-3">
        {transactions.map((txn) => (
          <TransactionItem key={txn.transaction_id} transaction={txn} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoading}
          className="mt-4 w-full py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      )}

      {transactions.length === 0 && !isLoading && (
        <p className="text-sm text-text-muted text-center py-8">
          No activity yet. Log your first action!
        </p>
      )}
    </div>
  );
}

function TransactionItem({ transaction }: { transaction: Transaction }) {
  const [expanded, setExpanded] = useState(false);

  const isPositive = transaction.delta < 0; // Negative delta = burning karma = good

  return (
    <div
      className={`p-3 rounded-lg border-l-4 ${
        isPositive ? 'border-l-green-400 bg-green-400/5' : 'border-l-amber-400 bg-amber-400/5'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <span className="text-sm font-medium text-text-primary capitalize">
            {transaction.category || 'Unknown'}
          </span>
          {transaction.subcategory && (
            <span className="text-xs text-text-muted ml-2">
              ({transaction.subcategory})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${
            isPositive ? 'text-green-400' : 'text-amber-400'
          }`}>
            {isPositive ? '−' : '+'}{Math.abs(transaction.delta).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
        <span>{formatRelativeTime(transaction.created_at)}</span>
        {transaction.dasha_lord && (
          <>
            <span>•</span>
            <span>{transaction.dasha_lord} period</span>
          </>
        )}
        {transaction.authenticity && (
          <>
            <span>•</span>
            <span className="capitalize">{transaction.authenticity}</span>
          </>
        )}
      </div>

      {transaction.reasoning && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-accent-purple hover:underline"
        >
          {expanded ? 'Hide reasoning' : 'Show reasoning'}
        </button>
      )}

      {expanded && transaction.reasoning && (
        <p className="mt-2 text-sm text-text-secondary bg-background-tertiary/50 p-2 rounded">
          {transaction.reasoning}
        </p>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
```

### 5. StreakDisplay

Current and longest streak display.

```tsx
// frontend/apps/web/src/components/karma/StreakDisplay.tsx

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  lastPositiveDate: string | null;
}

/**
 * StreakDisplay - Streak tracking visualization
 *
 * Design:
 * - Fire icon for active streaks
 * - Trophy icon for longest streak
 * - Encouraging messages
 */
export function StreakDisplay({
  currentStreak,
  longestStreak,
  lastPositiveDate,
}: StreakDisplayProps) {
  const isStreakActive = lastPositiveDate
    ? isWithinOneDay(new Date(lastPositiveDate))
    : false;

  const getMessage = () => {
    if (currentStreak === 0) return "Start your streak today!";
    if (currentStreak === longestStreak && currentStreak > 1) return "New record!";
    if (currentStreak >= 7) return "Incredible consistency!";
    if (currentStreak >= 3) return "Building momentum!";
    return "Keep going!";
  };

  return (
    <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-text-muted mb-4">Streaks</h3>

      <div className="flex justify-around">
        {/* Current streak */}
        <div className="text-center">
          <div className={`text-3xl mb-1 ${isStreakActive ? 'animate-pulse' : ''}`}>
            🔥
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {currentStreak}
          </div>
          <div className="text-xs text-text-muted">Current</div>
        </div>

        {/* Longest streak */}
        <div className="text-center">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-2xl font-bold text-accent-gold">
            {longestStreak}
          </div>
          <div className="text-xs text-text-muted">Longest</div>
        </div>
      </div>

      <p className="mt-4 text-sm text-center text-text-secondary">
        {getMessage()}
      </p>
    </div>
  );
}

function isWithinOneDay(date: Date): boolean {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours < 36; // Allow some grace period
}
```

### 6. TrendChart

30-day balance visualization.

```tsx
// frontend/apps/web/src/components/karma/TrendChart.tsx

interface DailySummary {
  date: string;
  closing_balance: number;
  burned: number;
  added: number;
}

interface TrendChartProps {
  dailySummaries: DailySummary[];
  sevenDayDelta: number;
  thirtyDayDelta: number;
  trendDirection: 'improving' | 'declining' | 'stable';
}

/**
 * TrendChart - Balance trend visualization
 *
 * Uses simple CSS/SVG chart (no heavy charting library)
 * Shows 30-day balance line with summary stats
 */
export function TrendChart({
  dailySummaries,
  sevenDayDelta,
  thirtyDayDelta,
  trendDirection,
}: TrendChartProps) {
  if (dailySummaries.length < 2) {
    return (
      <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Trends</h3>
        <p className="text-sm text-text-muted text-center py-8">
          Need more data to show trends. Keep logging actions!
        </p>
      </div>
    );
  }

  // Calculate chart bounds
  const balances = dailySummaries.map(s => s.closing_balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const range = maxBalance - minBalance || 1;

  // Generate SVG path
  const width = 300;
  const height = 100;
  const padding = 10;

  const points = dailySummaries.map((s, i) => {
    const x = padding + (i / (dailySummaries.length - 1)) * (width - 2 * padding);
    const y = padding + (1 - (s.closing_balance - minBalance) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  const trendColors = {
    improving: 'text-green-400',
    declining: 'text-amber-400',
    stable: 'text-text-muted',
  };

  return (
    <div className="bg-background-secondary border border-ui-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-text-primary">30-Day Trend</h3>
        <span className={`text-sm font-medium capitalize ${trendColors[trendDirection]}`}>
          {trendDirection}
        </span>
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 mb-4">
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-accent-purple"
        />
        {/* Start/end dots */}
        <circle
          cx={points[0].split(',')[0]}
          cy={points[0].split(',')[1]}
          r="4"
          className="fill-accent-purple"
        />
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="4"
          className="fill-accent-gold"
        />
      </svg>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className={`text-lg font-bold ${
            sevenDayDelta < 0 ? 'text-green-400' : 'text-amber-400'
          }`}>
            {sevenDayDelta < 0 ? '−' : '+'}{Math.abs(sevenDayDelta).toFixed(1)}
          </div>
          <div className="text-xs text-text-muted">7-day change</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${
            thirtyDayDelta < 0 ? 'text-green-400' : 'text-amber-400'
          }`}>
            {thirtyDayDelta < 0 ? '−' : '+'}{Math.abs(thirtyDayDelta).toFixed(1)}
          </div>
          <div className="text-xs text-text-muted">30-day change</div>
        </div>
      </div>
    </div>
  );
}
```

### 7. KarmaDashboard (Container)

Main dashboard component combining all elements.

```tsx
// frontend/apps/web/src/components/karma/KarmaDashboard.tsx

import { useEffect } from 'react';
import { useKarmaStore } from '@/stores/karmaStore';
import { KarmaMeter } from './KarmaMeter';
import { OpportunityPanel } from './OpportunityPanel';
import { KarmaInput } from './KarmaInput';
import { TransactionFeed } from './TransactionFeed';
import { StreakDisplay } from './StreakDisplay';
import { TrendChart } from './TrendChart';

/**
 * KarmaDashboard - Main karma system interface
 *
 * Layout:
 * - Left column: Meter, Streaks, Input
 * - Right column: Opportunities, Transactions, Trends
 */
export function KarmaDashboard() {
  const {
    balance,
    isLoading,
    error,
    fetchBalance,
    fetchOpportunities,
    fetchTransactions,
    fetchTrends,
    submitAction,
    opportunities,
    transactions,
    trends,
    lastResult,
  } = useKarmaStore();

  useEffect(() => {
    fetchBalance();
    fetchOpportunities();
    fetchTransactions();
    fetchTrends();
  }, []);

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => fetchBalance()}
          className="mt-4 px-4 py-2 bg-accent-purple text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        Karma Ledger
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Meter */}
          <div className="bg-background-secondary border border-ui-border rounded-xl p-6 flex justify-center">
            {balance && (
              <KarmaMeter
                balance={balance.balance}
                floor={balance.floor}
                ceiling={balance.ceiling}
                trend={balance.trend}
                health={balance.health}
              />
            )}
          </div>

          {/* Streaks */}
          {balance && (
            <StreakDisplay
              currentStreak={balance.current_streak_days}
              longestStreak={balance.longest_streak_days}
              lastPositiveDate={balance.last_positive_date}
            />
          )}

          {/* Input */}
          <KarmaInput
            onSubmit={submitAction}
            isLoading={isLoading}
            lastResult={lastResult}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Opportunities */}
          {opportunities && (
            <OpportunityPanel
              currentDasha={opportunities.current_dasha}
              dashaThemes={opportunities.dasha_themes}
              opportunities={opportunities.opportunities}
              warnings={opportunities.warnings}
            />
          )}

          {/* Trends */}
          {trends && (
            <TrendChart
              dailySummaries={trends.daily_summaries}
              sevenDayDelta={trends.seven_day_delta}
              thirtyDayDelta={trends.thirty_day_delta}
              trendDirection={trends.trend_direction}
            />
          )}

          {/* Transactions */}
          <TransactionFeed
            transactions={transactions?.transactions || []}
            isLoading={isLoading}
            hasMore={transactions?.has_more || false}
            onLoadMore={() => fetchTransactions(transactions?.page + 1)}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-8 text-xs text-text-muted text-center">
        This is a symbolic feedback system, not spiritual judgment.
        For mental health concerns, please consult a professional.
      </p>
    </div>
  );
}
```

### 8. Zustand Store

```tsx
// frontend/apps/web/src/stores/karmaStore.ts

import { create } from 'zustand';
import { api } from '@/lib/api';

interface KarmaBalance {
  balance: number;
  floor: number;
  ceiling: number;
  total_burned: number;
  total_added: number;
  burn_efficiency: number;
  actions_count: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_positive_date: string | null;
  current_dasha: string | null;
  trend: 'rising' | 'falling' | 'stable';
  health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

interface KarmaStore {
  balance: KarmaBalance | null;
  opportunities: OpportunitiesResponse | null;
  transactions: TransactionHistoryResponse | null;
  trends: TrendsResponse | null;
  lastResult: ClassificationResult | null;
  isLoading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  fetchOpportunities: () => Promise<void>;
  fetchTransactions: (page?: number) => Promise<void>;
  fetchTrends: () => Promise<void>;
  submitAction: (message: string) => Promise<void>;
}

export const useKarmaStore = create<KarmaStore>((set, get) => ({
  balance: null,
  opportunities: null,
  transactions: null,
  trends: null,
  lastResult: null,
  isLoading: false,
  error: null,

  fetchBalance: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get('/api/v1/karma/balance');
      set({ balance: data, isLoading: false });
    } catch (err) {
      set({ error: 'Failed to fetch balance', isLoading: false });
    }
  },

  fetchOpportunities: async () => {
    try {
      const data = await api.get('/api/v1/karma/opportunities');
      set({ opportunities: data });
    } catch (err) {
      console.error('Failed to fetch opportunities', err);
    }
  },

  fetchTransactions: async (page = 1) => {
    try {
      const data = await api.get(`/api/v1/karma/transactions?page=${page}`);
      set({ transactions: data });
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    }
  },

  fetchTrends: async () => {
    try {
      const data = await api.get('/api/v1/karma/trends');
      set({ trends: data });
    } catch (err) {
      console.error('Failed to fetch trends', err);
    }
  },

  submitAction: async (message: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.post('/api/v1/karma/classify', { message });
      set({
        lastResult: {
          category: result.category,
          delta: result.final_delta,
          reasoning: result.reasoning,
        },
        isLoading: false,
      });
      // Refresh balance and transactions
      get().fetchBalance();
      get().fetchTransactions();
    } catch (err) {
      set({ error: 'Failed to classify action', isLoading: false });
    }
  },
}));
```

---

## Files to Create

| File | Description |
|------|-------------|
| `components/karma/KarmaMeter.tsx` | Animated balance gauge |
| `components/karma/OpportunityPanel.tsx` | Dasha suggestions |
| `components/karma/KarmaInput.tsx` | Action submission form |
| `components/karma/TransactionFeed.tsx` | Transaction history |
| `components/karma/StreakDisplay.tsx` | Streak visualization |
| `components/karma/TrendChart.tsx` | 30-day trend chart |
| `components/karma/KarmaDashboard.tsx` | Container component |
| `stores/karmaStore.ts` | Zustand state management |

---

## Implementation Phases

### Phase 1: Core Components
- KarmaMeter, KarmaInput
- Basic Zustand store
- Test: Render components with mock data

### Phase 2: Data Integration
- Connect to API endpoints
- TransactionFeed with real data
- Test: Full data flow

### Phase 3: Visualizations
- TrendChart, StreakDisplay
- OpportunityPanel
- Test: Visual regression tests

### Phase 4: Polish
- Animations and transitions
- Loading states
- Error handling
- Test: E2E flow

---

## Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation support
- Color contrast meets WCAG AA
- Screen reader announcements for balance changes

---

## Quality Validation

### Required Agent Checks

Before merging any implementation, run these agent validations:

**Frontend Code Quality (`code-quality-frontend` agent):**
```bash
# Run via Claude Code Task tool with subagent_type=code-quality-frontend
# Validates: ESLint, TypeScript strict mode, React best practices
```

Validation checklist:
- [ ] `bun run --filter @almamesh/web lint` - ESLint passes
- [ ] `bun run --filter @almamesh/web typecheck` - TypeScript strict passes
- [ ] `bun run --filter @almamesh/web test` - Component tests pass
- [ ] `bunx playwright test karma.spec.ts` - E2E tests pass

**Component Quality Standards:**
- [ ] All components have TypeScript interfaces for props
- [ ] No `any` types - use proper typing
- [ ] Accessibility: ARIA labels, keyboard navigation
- [ ] Loading and error states handled
- [ ] Responsive design (mobile-first)

**Architecture Review (`architecture-advisor` agent):**
- Review component composition patterns
- Validate Zustand store design
- Check for unnecessary re-renders

### Performance Checklist

- [ ] No large dependencies added (keep bundle size small)
- [ ] SVG charts preferred over heavy charting libraries
- [ ] Lazy loading for dashboard route
- [ ] Debounced API calls on user input

### Accessibility Checklist

- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] All interactive elements are keyboard accessible
- [ ] Screen reader announcements for balance changes
- [ ] No motion for users with `prefers-reduced-motion`

---

## References

- **Template**: [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) - Quality validation requirements
- Spec 056: Karma API Endpoints
- Existing component patterns (DashaSummaryCard)
- Tailwind color system in `tailwind.config.js`
