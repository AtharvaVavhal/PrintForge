import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/services/api/client';
import styles from './AnnouncementBar.module.css';

const DISMISSED_KEY = 'announcement-dismissed';

export function AnnouncementBar() {
  const [visible, setVisible] = useState(true);
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);
    if (dismissed) {
      setVisible(false);
      setLoading(false);
      return;
    }
    // Fetch announcement text from AppSetting API
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: { value: string } }>('/settings/announcement_text')
      .then((res) => {
        if (cancelled) return;
        if (res.data.data?.value) {
          setText(res.data.data.value);
        } else {
          setVisible(false);
        }
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !visible || !text) return null;

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <p className={styles.text}>{text}</p>
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