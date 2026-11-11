"use client"

import { useMediaQuery } from "@/hooks/useMediaQuery"
import { MEDIA } from "@/lib/media"

/**
 * True on touch screens (phones, tablets). Pickers use the device's own there (Ancung, 10 Nov;
 * design B1.6: "Phones use the phone's own picker"): the iOS and Android wheels and sheets suit a
 * finger better than a small popover. By pointer, not width, so a narrow laptop window keeps the
 * desktop pickers. The server renders the desktop ones.
 */
export const useCoarsePointer = () => useMediaQuery(MEDIA.coarse)
