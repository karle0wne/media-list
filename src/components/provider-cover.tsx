import Image from "next/image";

type ProviderCoverProps = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
};

export function ProviderCover({ src, alt = "", width, height, className }: ProviderCoverProps) {
  return <Image src={src} alt={alt} width={width} height={height} className={className} unoptimized />;
}
