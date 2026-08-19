import Image from "next/image";

type ProviderCoverProps = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
};

export function ProviderCover({ src, alt = "", width, height, className }: ProviderCoverProps) {
  return <Image src={normalizeProviderCoverUrl(src)} alt={alt} width={width} height={height} className={className} unoptimized />;
}

export function normalizeProviderCoverUrl(src: string) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.hostname !== "image.tmdb.org") return src;
    const match = /^\/t\/p\/(w92|w154|w185|w342|w500|w780|original)(\/.*)$/.exec(url.pathname);
    if (!match) return src;
    url.pathname = `/t/p/w185${match[2]}`;
    return url.toString();
  } catch {
    return src;
  }
}
