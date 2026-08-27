import { useState } from 'react'
import { useUpdateCartItem } from '@/hooks/useUpdateCartItem'
import { useRemoveCartItem } from '@/hooks/useRemoveCartItem'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { QuantityInput } from '@/components/ui/QuantityInput'
import type { CartItemView } from '@/types/cart'
import styles from './CartLineItem.module.css'

const UNAVAILABLE_MESSAGES: Record<NonNullable<CartItemView['unavailableReason']>, string> = {
  PRODUCT_INACTIVE: 'This product is no longer available.',
  VARIANT_UNAVAILABLE: 'This option is no longer available.',
}

interface CartLineItemProps {
  item: CartItemView
}

/**
 * Quantity has no client-known min/max here — CartItemView doesn't carry
 * the product's minQuantity/maxQuantity, unlike the Add-to-Cart flow which
 * has the full Product. So this deliberately does NOT clamp client-side
 * (QuantityInput's `max` is left unset, `min` is the DTO's own floor of 1)
 * — an out-of-bounds PATCH is rejected server-side and its message shown
 * here, exactly the "surface the server's validation error" requirement.
 * The input stays disabled while a mutation is in flight so rapid clicks
 * can't race each other; on error the cache is untouched, so the
 * displayed quantity simply reverts to the last server-confirmed value.
 */
export function CartLineItem({ item }: CartLineItemProps) {
  const updateItem = useUpdateCartItem()
  const removeItem = useRemoveCartItem()
  const [removeError, setRemoveError] = useState<string | null>(null)

  function handleQuantityChange(quantity: number) {
    updateItem.reset()
    updateItem.mutate({ itemId: item.id, quantity })
  }

  function handleRemove() {
    setRemoveError(null)
    removeItem.mutate(item.id, {
      onError: (err) => setRemoveError(getApiErrorMessage(err)),
    })
  }

  return (
    <li className={styles.line}>
      <div className={styles.details}>
        <p className={styles.name}>{item.productName}</p>
        {item.variantLabel && <p className={styles.meta}>{item.variantLabel}</p>}
        {item.customizations.length > 0 && (
          <ul className={styles.customizations}>
            {item.customizations.map((c) => (
              <li key={c.fieldId}>
                {c.label}: {c.textValue ?? (c.uploadedFileId ? 'file uploaded' : '—')}
              </li>
            ))}
          </ul>
        )}

        {!item.isAvailable && item.unavailableReason && (
          <Alert variant="error">{UNAVAILABLE_MESSAGES[item.unavailableReason]}</Alert>
        )}
        {updateItem.isError && (
          <Alert variant="error">{getApiErrorMessage(updateItem.error)}</Alert>
        )}
        {removeError && <Alert variant="error">{removeError}</Alert>}
      </div>

      <div className={styles.controls}>
        <QuantityInput
          value={item.quantity}
          onChange={handleQuantityChange}
          disabled={updateItem.isPending || removeItem.isPending}
        />
        <p className={styles.unitPrice}>{formatPrice(item.unitPrice)} each</p>
        <p className={styles.lineTotal}>{formatPrice(item.lineTotal)}</p>
        <Button
          variant="ghost"
          isLoading={removeItem.isPending}
          onClick={handleRemove}
          className={styles.removeButton}
        >
          Remove
        </Button>
      </div>
    </li>
  )
}
