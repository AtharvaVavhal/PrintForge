import { useMutation } from '@tanstack/react-query'
import { uploadFile } from '@/services/api/uploads'

/** Thin useMutation wrapper — no cache invalidation needed, an uploaded
 * file isn't read back through TanStack Query anywhere yet. */
export function useUploadFile() {
  return useMutation({
    mutationFn: uploadFile,
  })
}
