/**
 * The root layout.
 *
 * Deliberately almost empty. The product is an API and a set of game clients;
 * the marketing page and the dashboard arrive in the beads that own them, and a
 * layout that grew a nav bar now would be a layout nobody could tell apart from
 * the one that grew it on purpose.
 */
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
