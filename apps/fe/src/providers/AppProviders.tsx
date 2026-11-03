'use client';

import dynamic from 'next/dynamic';
import type { PropsWithChildren } from 'react';
import { Navigation } from '@/components/layout/Navigation';

// Wallet libraries require browser APIs. Initialize them after hydration.
const NearProvider = dynamic(
  () => import('@/providers/NearProvider').then((module) => module.NearProvider),
  { ssr: false },
);

export function Providers({ children }: PropsWithChildren) {
  return <NearProvider><Navigation />{children}</NearProvider>;
}
