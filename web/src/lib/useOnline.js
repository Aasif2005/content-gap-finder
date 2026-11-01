import { useEffect, useState } from 'react';
import { isOffline } from './authErrors.js';

/** True while the browser has a network connection; follows it as it comes and goes. */
export function useOnline() {
  const [online, setOnline] = useState(() => !isOffline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(!isOffline());
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
