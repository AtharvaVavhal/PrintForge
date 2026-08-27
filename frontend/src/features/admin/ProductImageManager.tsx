import { useRef, useState } from 'react'
import { useUploadFile } from '@/hooks/useUploadFile'
import { useAddProductImage } from '@/hooks/useAddProductImage'
import { useRemoveProductImage } from '@/hooks/useRemoveProductImage'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { getApiErrorMessage } from '@/utils/apiError'
import type { ProductImage } from '@/types/catalog'
import styles from './ProductImageManager.module.css'

interface ProductImageManagerProps {
  productId: string
  images: ProductImage[]
  onImagesChange: (images: ProductImage[]) => void
}

/**
 * Reuses useUploadFile (POST /uploads, same endpoint the Phase 3
 * customization file fields use) rather than a bespoke upload path — an
 * admin uploading a product photo is just another authenticated upload;
 * `resolveUrl` on the backend already gives product-purpose uploads the
 * public 'upload' delivery type (uploads.service.ts's role-based
 * inference: ADMIN -> 'product'). Two requests in sequence (upload, then
 * POST /products/:id/images referencing the resulting uploadedFileId) —
 * no single combined endpoint exists.
 */
export function ProductImageManager({ productId, images, onImagesChange }: ProductImageManagerProps) {
  const uploadFile = useUploadFile()
  const addImage = useAddProductImage(productId)
  const removeImage = useRemoveProductImage(productId)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelected(file: File) {
    setError(null)
    try {
      const uploaded = await uploadFile.mutateAsync(file)
      const created = await addImage.mutateAsync({
        uploadedFileId: uploaded.id,
        sortOrder: images.length,
        isPrimary: images.length === 0,
      })
      onImagesChange([...images, created])
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemove(imageId: string) {
    setError(null)
    setRemovingId(imageId)
    try {
      await removeImage.mutateAsync(imageId)
      onImagesChange(images.filter((image) => image.id !== imageId))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setRemovingId(null)
    }
  }

  const isUploading = uploadFile.isPending || addImage.isPending

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Images</h2>
        <Button
          type="button"
          variant="secondary"
          isLoading={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload image
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFileSelected(file)
          }}
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {images.length === 0 ? (
        <p className={styles.empty}>No images yet.</p>
      ) : (
        <div className={styles.grid}>
          {images.map((image) => (
            <div key={image.id} className={styles.tile}>
              <img src={image.url} alt="" className={styles.thumbnail} />
              {image.isPrimary && <span className={styles.primaryFlag}>Primary</span>}
              <Button
                type="button"
                variant="secondary"
                className={styles.removeButton}
                isLoading={removingId === image.id}
                onClick={() => void handleRemove(image.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
