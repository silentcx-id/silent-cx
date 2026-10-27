import Image from "next/image";
import Link from "next/link";
import logoDark from "../../public/brand/logo-gelap.png";
import logoLight from "../../public/brand/logo-terang.png";

// Logo resmi SilentCX dari folder logo/: versi putih-emas untuk tema gelap, hitam untuk tema terang.
// Keduanya dirender dan dipilih lewat CSS supaya tidak berkedip saat tema berganti.
export function Logo({ href = "/", height = 42 }: { href?: string; height?: number }) {
  const width = Math.round((height * logoDark.width) / logoDark.height);
  return (
    <Link href={href} className="inline-flex shrink-0 items-center" aria-label="SilentCX">
      <Image src={logoDark} alt="SilentCX" width={width} height={height} priority className="logo-dark" />
      <Image src={logoLight} alt="" aria-hidden="true" width={width} height={height} priority className="logo-light" />
    </Link>
  );
}
