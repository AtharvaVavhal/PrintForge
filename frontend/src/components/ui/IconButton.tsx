import { cn } from '@/utils/cn';
import styles from './IconButton.module.css';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'outline' | 'solid';
}

export function IconButton({
  children,
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(styles.btn, styles[size], styles[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}