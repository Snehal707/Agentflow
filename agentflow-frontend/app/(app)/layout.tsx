import { ClientProviders } from "./ClientProviders";
import { AccessCodeGate } from "@/components/app/AccessCodeGate";

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClientProviders>
      {children}
      <AccessCodeGate />
    </ClientProviders>
  );
}
