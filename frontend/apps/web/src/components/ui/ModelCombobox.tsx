import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { cn } from './cn';

/**
 * ModelCombobox — a searchable, free-typable model picker.
 *
 * Replaces a hand-typed OpenRouter model slug box (a mistyped/garbage slug
 * used to dead-end with "that model isn't available"). This component is
 * presentation-only: the caller owns fetching the catalog and deciding what
 * to pass as `options`. Free text is ALWAYS preserved — local/Ollama users
 * type their own model names, which never appear in `options` — and the
 * component degrades to a plain input when there is nothing to suggest
 * (offline / not OpenRouter / still loading with no catalog yet).
 */

export interface ModelOption {
  /** The slug used verbatim as the model id, e.g. "openai/gpt-4o". */
  readonly id: string;
  /** Human-friendly label; may equal id. */
  readonly name: string;
}

export interface ModelComboboxProps {
  /** Current text value (the raw model id string). Controlled. */
  readonly value: string;
  /** Fired on every keystroke AND on selecting an option (with the option's id). */
  readonly onChange: (value: string) => void;
  /** The catalog to suggest. May be empty. */
  readonly options: readonly ModelOption[];
  readonly placeholder?: string;
  /** True while the catalog is being fetched (shows a muted "loading" row). */
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Forwarded to the <input> so callers can target it in tests. */
  readonly 'data-testid'?: string;
  readonly 'aria-label'?: string;
  /** Muted "loading" row copy; caller passes a translated string (English default). */
  readonly loadingLabel?: string;
  /** Muted "keep typing to narrow" row copy when the list is capped (English default). */
  readonly moreLabel?: string;
}

// English fallbacks — the caller (e.g. the settings screen) passes translated
// strings via `loadingLabel` / `moreLabel` to keep i18n parity.
const LOADING_TEXT = 'Loading models…';
const TRUNCATION_HINT_TEXT = 'Type to search…';
// A freshly-opened picker BROWSES a short slice (so you search instead of
// scrolling a 300-model catalog); typing SEARCHES with a wider cap for matches.
const BROWSE_LIMIT = 8;
const SEARCH_LIMIT = 50;

export function ModelCombobox({
  value,
  onChange,
  options,
  placeholder,
  loading = false,
  disabled = false,
  id,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  loadingLabel = LOADING_TEXT,
  moreLabel = TRUNCATION_HINT_TEXT,
}: ModelComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  // Whether the user has typed since focusing. A freshly-opened picker BROWSES
  // (a short slice of the whole catalog); the first keystroke switches to SEARCH
  // (filter by the typed text). So a selected slug never collapses the list to
  // itself — reopen and you can search the whole catalog afresh.
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the deferred blur-close on unmount so it can't setState on a gone tree.
  useEffect(
    () => () => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    },
    [],
  );

  const filtered = useMemo(() => {
    const query = isSearching ? value.trim().toLowerCase() : '';
    if (query === '') return options;
    return options.filter(
      (option) =>
        option.id.toLowerCase().includes(query) || option.name.toLowerCase().includes(query),
    );
  }, [options, value, isSearching]);

  const optionLimit = isSearching ? SEARCH_LIMIT : BROWSE_LIMIT;
  const visibleOptions = filtered.slice(0, optionLimit);
  const showTruncationHint = filtered.length > optionLimit;
  const showLoadingRow = loading && visibleOptions.length === 0;
  const dropdownVisible = isOpen && !disabled && (visibleOptions.length > 0 || showLoadingRow);

  const openIfPossible = () => {
    if (!disabled) setIsOpen(true);
  };

  const selectOption = (option: ModelOption) => {
    onChange(option.id);
    setIsOpen(false);
    setIsSearching(false);
    setActiveIndex(null);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsSearching(true);
    setActiveIndex(null);
    openIfPossible();
  };

  const handleFocus = () => {
    // Browse from a clean slate; select the current text so the first keystroke
    // replaces the slug and searches (only when there's a catalog to search).
    setIsSearching(false);
    if (options.length > 0) inputRef.current?.select();
    openIfPossible();
  };

  const handleBlur = () => {
    // Guard: a mousedown on an option normally fires blur before the click —
    // defer the close so the click's select still registers. (The option row
    // also preventDefaults its own mousedown, belt-and-suspenders.)
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    blurTimeout.current = setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(null);
    }, 0);
  };

  const moveActive = (direction: 1 | -1) => {
    if (visibleOptions.length === 0) {
      setActiveIndex(null);
      return;
    }
    setActiveIndex((prev) => {
      if (prev === null) return direction === 1 ? 0 : visibleOptions.length - 1;
      return (prev + direction + visibleOptions.length) % visibleOptions.length;
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!dropdownVisible) {
        openIfPossible();
        setActiveIndex(visibleOptions.length > 0 ? 0 : null);
        return;
      }
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!dropdownVisible) {
        openIfPossible();
        setActiveIndex(visibleOptions.length > 0 ? visibleOptions.length - 1 : null);
        return;
      }
      moveActive(-1);
    } else if (e.key === 'Enter') {
      if (dropdownVisible && activeIndex !== null && visibleOptions[activeIndex]) {
        e.preventDefault();
        selectOption(visibleOptions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsSearching(false);
    }
  };

  const activeOptionId =
    dropdownVisible && activeIndex !== null && visibleOptions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={dropdownVisible}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg',
          'text-text-primary text-sm disabled:cursor-not-allowed disabled:opacity-50',
        )}
        data-testid={dataTestId}
      />
      {dropdownVisible && (
        <ul
          role="listbox"
          id={listboxId}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-ui-border bg-background-secondary shadow-lg"
        >
          {showLoadingRow ? (
            <li className="px-3 py-2 text-xs text-text-muted">{loadingLabel}</li>
          ) : (
            <>
              {visibleOptions.map((option, index) => (
                <li
                  key={option.id}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    index === activeIndex && 'bg-background-tertiary',
                  )}
                >
                  <span className="font-mono">{option.id}</span>
                  {option.name !== option.id && (
                    <span className="block text-xs text-text-muted">{option.name}</span>
                  )}
                </li>
              ))}
              {showTruncationHint && (
                <li className="px-3 py-2 text-xs text-text-muted">{moreLabel}</li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
