import styles from './RequiredMark.module.css'

/**
 * The one required-field cue for form labels (UX-46). The asterisk is
 * purely visual — `aria-hidden` so a screen reader never reads "star" —
 * because the field itself carries the real semantic via `aria-required`,
 * which is what assistive tech announces. Rendered inside the existing
 * `<label>` / `<legend>` so label ↔ control associations are untouched.
 */
export function RequiredMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      {' '}
      *
    </span>
  )
}
