import React from "react";

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
      window.location.hash = href;
    }
  };

  return (
    <a href={href.startsWith("/") ? `#${href}` : href} className={className} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
