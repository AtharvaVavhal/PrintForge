import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/services/api/client';
import styles from './AnnouncementBar.module.css';

const DISMISSED_KEY = 'announcement-dismissed';

export function AnnouncementBar() {
  /* ---------------------------------------------------------------
   * 1️⃣  Read dismissal flag once, during the very first render.
   * --------------------------------------------------------------- */
  const [initiallyDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) !== null,
  );

  /* ---------------------------------------------------------------
   * 2️⃣  Initialise both visible and loading from that flag.
   * --------------------------------------------------------------- */
  const [visible, setVisible] = useState(!initiallyDismissed);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(!initiallyDismissed);

  /* ---------------------------------------------------------------
   * 3️⃣  If already dismissed – skip the fetch entirely, no setState.
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (initiallyDismissed) return;   // ← no setState at all

    let cancelled = false;

    apiClient
      .get<{ success: boolean; data: { value: string } }>('/settings/announcement_text')
      .then((res) => {
        if (cancelled) return;
        const value = res.data.data?.value;
        if (value) {
          setText(value);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [initiallyDismissed]);

  if (loading || !visible) return null;

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <div className={styles.content}>
        {text ? (
          <p className={styles.text}>{text}</p>
        ) : (
          <div className={styles.uvSegments}>
            <span className={styles.segment}>
              🎁 Free Message Bottle at ₹1,799+
            </span>
            <span className={styles.divider} aria-hidden="true">|</span>
            <span className={styles.segment}>
              🚚 Free Shipping at ₹1,000+
            </span>
            <span className={styles.divider} aria-hidden="true">|</span>
            <span className={styles.segment}>
              🎉 Extra 12% OFF – Code <strong className={styles.code}>UVPixel12</strong>
            </span>
          </div>
        )}
      </div>
      <button
        className={styles.close}
        onClick={() => {
          sessionStorage.setItem(DISMISSED_KEY, 'true');
          setVisible(false);
        }}
        aria-label="Dismiss announcement"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}