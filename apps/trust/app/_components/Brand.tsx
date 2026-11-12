import Link from "next/link";

export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" width={28} height={28} alt="" />
      <span>
        HelloNear <span className="brand-sub">{label}</span>
      </span>
    </Link>
  );
}
