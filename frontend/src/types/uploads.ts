/**
 * Mirrors backend/src/uploads/uploads.controller.ts's UploadedFileView —
 * the response shape of POST /uploads and GET /uploads/:id.
 */
export interface UploadedFile {
  id: string
  url: string
  format: string
  bytes: number
  createdAt: string
}
