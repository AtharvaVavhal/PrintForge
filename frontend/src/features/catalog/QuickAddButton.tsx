import { useState, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '@/hooks/useAuth'
import { useAddCartItem } from '@/hooks/useAddCartItem'
import { getApiErrorMessage } from '@/utils/apiError'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import type { Product } from '@/types/catalog'
import styles from './QuickAddButton.module.css'

interface QuickAddButtonProps {
  product: Product
}

/**
 * Same useAddCartItem() mutation ProductDetailPage's AddToCartControls
 * uses (backend/src/cart's real add-item endpoint) — no new cart-write
 * logic. Only ever rendered by ProductCard for a product with zero
 * variants and zero required customization fields, so there's nothing
 * here to select: quantity is always product.minQuantity.
 *
 * Sits inside ProductCard's card div as a sibling of the card's <Link>,
 * not nested inside it — a <button> nested in an <a> is invalid HTML and
 * unreliable for keyboard/screen-reader users, so this stays a sibling
 * even though visually it renders inside the same card.
 *
 * Auth handling mirrors AddToCartControls exactly (§10: login required
 * starting at "Add to cart", checked at click time, same `state: {from}`
 * redirect convention LoginPage's post-login redirect already reads).
 */
export function QuickAddButton({ product }: QuickAddButtonProps) {
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { mutate, isPending, error, reset } = useAddCartItem()
  const [justAdded, setJustAdded] = useState(false)

  function goToLogin() {
    void navigate(ROUTES.LOGIN, { state: { from: location } })
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Stops the click reaching the sibling <Link> anyway (bubbling
    // through the shared .card container) rather than navigating to the PDP.
    event.preventDefault()
    event.stopPropagation()
    setJustAdded(false)
    reset()

    if (status !== 'authenticated') {
      goToLogin()
      return
    }

    mutate(
      { productId: product.id, quantity: product.minQuantity },
      {
        onSuccess: () => setJustAdded(true),
        onError: (err) => {
          if (axios.isAxiosError(err) && err.response?.status === 401) {
            goToLogin()
          }
        },
      },
    )
  }

  return (
    <div className={styles.wrap}>
      <Button
        type="button"
        variant="secondary"
        className={styles.button}
        onClick={handleClick}
        isLoading={isPending}
      >
        {justAdded ? 'Added ✓' : 'Quick add'}
      </Button>
      {error && <p className={styles.error}>{getApiErrorMessage(error)}</p>}
    </div>
  )
}
