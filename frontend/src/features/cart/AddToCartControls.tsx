import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '@/hooks/useAuth'
import { useAddCartItem } from '@/hooks/useAddCartItem'
import { getApiErrorMessage } from '@/utils/apiError'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { QuantityInput } from '@/components/ui/QuantityInput'
import type { Product } from '@/types/catalog'
import type { CustomizationFormState } from '@/features/customization/CustomizationForm'
import styles from './AddToCartControls.module.css'

interface AddToCartControlsProps {
  product: Product
  selectedVariantId: string | null
  customization: CustomizationFormState
}

/**
 * §10: login is required starting at "Add to Cart," not before — this page
 * is public, so status is checked here, at the moment of the click, not
 * via a route guard. An unauthenticated click never calls the API; it
 * redirects to /login with the same `state: {from: location}` convention
 * ProtectedRoute uses, so LoginPage's existing post-login redirect sends
 * the customer back here. A 401 surfacing from the mutation itself (the
 * rare race: session expired between render and click, and the axios
 * interceptor's refresh also failed) gets the same redirect as a fallback.
 *
 * Price shown elsewhere on this page is a preview only — the actual
 * unitPrice/lineTotal this add produces is whatever GET /cart (or this
 * mutation's own response) returns, never computed here.
 */
export function AddToCartControls({
  product,
  selectedVariantId,
  customization,
}: AddToCartControlsProps) {
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [quantity, setQuantity] = useState(product.minQuantity)
  const [justAdded, setJustAdded] = useState(false)
  const { mutate, isPending, error, reset } = useAddCartItem()

  const variantRequired = product.variants.length > 0
  const variantMissing = variantRequired && !selectedVariantId
  const disabled = variantMissing || !customization.isValid || isPending

  function goToLogin() {
    void navigate(ROUTES.LOGIN, { state: { from: location } })
  }

  function handleAddToCart() {
    setJustAdded(false)
    reset()

    if (status !== 'authenticated') {
      goToLogin()
      return
    }
    if (disabled) {
      return
    }

    mutate(
      {
        productId: product.id,
        variantId: selectedVariantId ?? undefined,
        quantity,
        customizations: customization.values,
      },
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
    <div className={styles.controls}>
      <QuantityInput
        value={quantity}
        onChange={setQuantity}
        min={product.minQuantity}
        max={product.maxQuantity ?? undefined}
      />

      <Button onClick={handleAddToCart} isLoading={isPending} disabled={disabled}>
        Add to cart
      </Button>

      {variantMissing && <Alert variant="error">Please select an option above.</Alert>}
      {error && <Alert variant="error">{getApiErrorMessage(error)}</Alert>}
      {justAdded && <Alert variant="success">Added to cart.</Alert>}
    </div>
  )
}
