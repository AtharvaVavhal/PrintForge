import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { cn } from '@/utils/cn';
import styles from './CurrencySelector.module.css';

interface Currency {
  code: string;
  symbol: string;
  label: string;
}

const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', label: 'India' },
];

export function CurrencySelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Currency>(CURRENCIES[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A disclosure control that opens to reveal its one already-selected
  // option is pure clutter — render nothing until a second currency
  // genuinely exists (UX-20). Pricing is unaffected either way.
  if (CURRENCIES.length <= 1) {
    return null;
  }

  return (
    <div className={styles.wrapper} ref={dropdownRef}>
      <button
        className={cn(styles.trigger, open && styles.triggerOpen)}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select currency"
      >
        <Globe size={16} aria-hidden="true" className={styles.icon} />
        <span className={styles.code}>{selected.code}</span>
        <ChevronDown size={14} aria-hidden="true" className={cn(styles.chevron, open && styles.chevronOpen)} />
      </button>

      {open && (
        <ul className={styles.list} role="listbox" aria-label="Currencies">
          {CURRENCIES.map((c) => (
            <li key={c.code} role="option" aria-selected={c.code === selected.code}>
              <button
                className={styles.option}
                onClick={() => {
                  setSelected(c);
                  setOpen(false);
                }}
              >
                <span className={styles.optionFlag}>{c.label}</span>
                <span className={styles.optionCode}>{c.code}</span>
                <span className={styles.optionSymbol}>{c.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}