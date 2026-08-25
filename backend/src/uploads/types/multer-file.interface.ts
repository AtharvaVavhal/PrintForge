/**
 * Structural subset of Express.Multer.File actually used here. Declared
 * locally rather than depending on @types/multer (not an existing project
 * dependency) — @UploadedFile() doesn't enforce a type at compile time, so
 * this is purely for our own type safety against the fields we read.
 */
export interface MulterFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
