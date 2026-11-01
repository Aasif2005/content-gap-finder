import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/useOnline.js';

/** A thin bar across the top while the browser is offline, so every screen explains why nothing loads. */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="fade-in fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-ink px-4 py-2 text-[14px] font-medium text-on-ink">
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      <span>You are offline. Check your internet connection.</span>
    </div>
  );
}
