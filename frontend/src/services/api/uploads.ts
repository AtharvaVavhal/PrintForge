import type { ApiSuccessResponse } from '@/types/api'
import type { UploadedFile } from '@/types/uploads'
import { apiClient } from './client'

/**
 * POST /uploads (backend/src/uploads/uploads.controller.ts) — auth
 * required, any logged-in user, multipart field name must be exactly
 * "file" (the backend's FileInterceptor is configured for that name).
 * Used by the Phase 3 customization form's file-upload fields.
 *
 * Deliberately does NOT set a Content-Type header: when the body is a
 * FormData instance, the browser computes `multipart/form-data;
 * boundary=...` itself. Setting the header manually here would leave off
 * the boundary parameter (axios won't add one to a header you already
 * set), and multer would fail to parse the body server-side.
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post<ApiSuccessResponse<UploadedFile>>('/uploads', formData)
  return res.data.data
}
