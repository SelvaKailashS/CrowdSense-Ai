import React from "react";

export function getEffectiveRoute(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (hash && hash !== "/") return hash;
  const path = window.location.pathname.trim();
  if (path && path !== "/") return path;
  return "/";
}

export function navigateTo(href: string) {
  if (typeof window === "undefined") return;
  if (href.startsWith("/")) {
    window.location.hash = href;
    window.dispatchEvent(new CustomEvent("crowdsense-nav", { detail: href }));
  } else {
    window.location.href = href;
  }
}

export default function Link({
  href,
  children,
  className,
  onClick,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  [key: string]: any;
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && typeof href === "string" && href.startsWith("/")) {
      e.preventDefault();
      navigateTo(href);
    }
  };

  return (
    <a
      href={href.startsWith("/") ? `#${href}` : href}
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
}
