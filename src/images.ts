import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** 发给模型的图片：按长边缩到 IMAGE_LONG_EDGE 像素内、编码后不超过 IMAGE_MAX_BYTES（base64 后约 5.3 MiB）。 */
export const IMAGE_LONG_EDGE = 2048
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024

export interface RequestImage { data: Uint8Array; mediaType: string }

/** 适配器取图片字节的入口；`available()` 为 false 时模型只声明文本输入。 */
export interface ImageReader {
  available(): boolean
  read(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<RequestImage>
}

/** 等比缩到长边不超过 max；不放大。 */
export function fitLongEdge(width: number, height: number, max: number = IMAGE_LONG_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 用 dsh 的附件服务读取一张图片的请求版本（服务自己缓存缩放结果）。 */
export function createImageReader(resolve: () => AttachmentStore | undefined): ImageReader {
  return {
    available: () => resolve() !== undefined,
    async read(ref, signal) {
      const attachments = resolve()
      if (!attachments) throw new Error('dsh 附件服务不可用，无法发送图片')
      const target = fitLongEdge(ref.width, ref.height)
      const version = await attachments.readImageRequest(ref, { ...target, maxBytes: IMAGE_MAX_BYTES }, signal)
      return { data: version.data, mediaType: version.mediaType }
    },
  }
}

export function toBase64(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64')
}
