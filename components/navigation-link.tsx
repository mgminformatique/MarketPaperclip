"use client";

import { useRouter } from "next/navigation";
import type { ComponentPropsWithoutRef } from "react";
import { useI18n } from "./i18n";
import { crawlableHref, localizedHref } from "../lib/i18n/locale";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

// Use the statically imported router. The current Vinext Link shim dynamically
// imports a navigation namespace whose named exports are lost in the client build.
// Keep a real href so native navigation, new tabs and no-JS browsing still work.
export default function NavigationLink({ href, onClick, ...props }: Props) {
  const router = useRouter();
  const { locale } = useI18n();
  const targetHref = localizedHref(href, locale);
  return (
    <a
      {...props}
      href={crawlableHref(href, locale)}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.currentTarget.hasAttribute("download") ||
          (event.currentTarget.target &&
            event.currentTarget.target !== "_self") ||
          !href.startsWith("/") ||
          href.startsWith("//")
        )
          return;
        event.preventDefault();
        router.push(targetHref);
      }}
    />
  );
}
