'use client';

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image';

/**
 * Cloudinary sizes and compresses the screenshot itself (WebP or AVIF where the
 * browser takes it), straight from its CDN. Any other address goes through Next.
 */
function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  return src.replace('/image/upload/', `/image/upload/f_auto,q_${quality ?? 'auto'},c_limit,w_${width}/`);
}

export function PortfolioImage(props: ImageProps) {
  const cloudinary = typeof props.src === 'string' && props.src.startsWith('https://res.cloudinary.com/') && props.src.includes('/image/upload/');
  // eslint-disable-next-line jsx-a11y/alt-text -- alt arrives in props
  return <Image {...props} loader={cloudinary ? cloudinaryLoader : undefined} />;
}
