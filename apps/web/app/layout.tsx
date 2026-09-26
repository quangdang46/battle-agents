/**
 * The root layout.
 *
 * Deliberately almost empty. The product is an API and a set of game clients;
 * a layout that grew a nav bar now would be a layout nobody could tell apart
 * from the one that grew it on purpose. The dashboard chrome belongs to the
 * `(app)` group, which is a different thing with a different boundary: this one
 * wraps the public replay too.
 */
import type { ReactNode } from 'react';

import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
