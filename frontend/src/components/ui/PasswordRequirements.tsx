import { Check, Circle } from 'lucide-react'
import { PASSWORD_REQUIREMENTS } from '@/schemas/auth.schema'
import { cn } from '@/utils/cn'
import styles from './PasswordRequirements.module.css'

interface PasswordRequirementsProps {
  /** The current password value — each requirement re-evaluates as it changes. */
  value: string
  /** Wire this to the password field's `aria-describedby`. */
  id?: string
}

/**
 * Inline checklist of the password rules the register / reset-password
 * schema actually enforces (UX-24). Derived entirely from
 * PASSWORD_REQUIREMENTS — it introduces no rule of its own, and the form's
 * own zod validation stays authoritative on submit.
 *
 * Not an aria-live region on purpose: it would re-announce on every
 * keystroke. It's a static list the field points at via aria-describedby,
 * so a screen-reader user hears the rules (and each item's met / not-met
 * state) when they move to the field or navigate the list.
 */
export function PasswordRequirements({ value, id }: PasswordRequirementsProps) {
  return (
    <ul className={styles.list} id={id} aria-label="Password requirements">
      {PASSWORD_REQUIREMENTS.map((requirement) => {
        const met = requirement.isMet(value)
        return (
          <li key={requirement.id} className={cn(styles.item, met && styles.met)}>
            {met ? (
              <Check size={15} className={styles.icon} aria-hidden="true" />
            ) : (
              <Circle size={15} className={styles.icon} aria-hidden="true" />
            )}
            <span>{requirement.label}</span>
            <span className={styles.srOnly}>{met ? ' — met' : ' — not met'}</span>
          </li>
        )
      })}
    </ul>
  )
}
