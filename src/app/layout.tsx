import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minimi Autonomous Search Agent',
  description:
    'Autonomous Chat Agent with Grounded Web Search & Episodic Temporal Memory for the Minimi Hiring Challenge',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090a0f] text-gray-100 flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}

