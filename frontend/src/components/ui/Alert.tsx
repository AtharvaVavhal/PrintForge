import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './Alert.module.css'

interface AlertProps {
  variant?: 'error' | 'success' | 'info'
  children: ReactNode
}

export function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <div className={cn(styles.alert, styles[variant])} role="alert">
      {children}
    </div>
  )
}
