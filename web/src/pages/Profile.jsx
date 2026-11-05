import { useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Input, Panel, SlideGroup, SLIDE_ITEM, Skeleton, UsageMeter, useToast } from '../components/ui/index.js';
import { GoogleMark } from '../components/auth/GoogleButton.jsx';
import { DeleteAccountDialog } from '../components/profile/DeleteAccountDialog.jsx';
import { SettingRow } from '../components/profile/SettingRow.jsx';
import { memberSince, normalizeName, resetsText } from '../components/profile/helpers.js';
import { useAuth } from '../lib/auth.jsx';
import { removeAvatar, uploadAvatar } from '../lib/api.js';
import { checkFile } from '../lib/avatarImage.js';
import { AvatarButton } from '../components/profile/AvatarButton.jsx';
import { AvatarEditor } from '../components/profile/AvatarEditor.jsx';
import { useMe } from '../lib/me.jsx';
import { updateDisplayName } from '../lib/profile.js';
import { Link, navigate } from '../lib/router.jsx';
import { useColorMode } from '../lib/colorMode.js';
import { cx } from '../lib/cx.js';

function NameForm({ user }) {
  const { reloadUser } = useAuth();
  const { refresh } = useMe();
  const toast = useToast();
  const [draft, setDraft] = useState(user.name ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const clean = normalizeName(draft);
  const unchanged = clean === (user.name ?? '');

  const save = async (e) => {
    e.preventDefault();
    if (busy || unchanged) return;
    if (!clean) { setError('Enter a name, or keep the one you have.'); inputRef.current?.focus(); return; }
    setError(null);
    setBusy(true);
    try {
      await updateDisplayName(clean);
      await reloadUser();
      refresh(); // the server learns the new name from the refreshed token
      setDraft(clean);
      toast.success('Name saved.');
    } catch (err) {
      setError(err.message);
      inputRef.current?.focus();
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} noValidate>
      <div className="flex flex-wrap gap-2.5">
        <div className="min-w-0 flex-1 basis-[220px]">
          <Input
            ref={inputRef}
            aria-label="Name"
            aria-describedby={error ? 'profile-name-error' : undefined}
            name="name"
            autoComplete="name"
            maxLength={120}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            invalid={Boolean(error)}
            disabled={busy}
          />
        </div>
        <Button type="submit" loading={busy} disabled={unchanged}>Save</Button>
      </div>
      <p id="profile-name-error" role="alert" className="mt-2 text-[13px] text-bad-fg empty:hidden">{error}</p>
    </form>
  );
}

/** The picture row: the avatar is the button; choosing a photo opens the editor. */
function PictureForm({ shownUser }) {
  const { me, refresh } = useMe();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);

  const pick = (f) => {
    setError(null);
    try { setFile(checkFile(f)); } catch (err) { setError(err.message); }
  };

  const save = async (dataUrl) => {
    await uploadAvatar(dataUrl);
    await refresh();
    setFile(null);
    toast.success('Profile picture saved.');
  };

  const remove = async () => {
    setError(null);
    setRemoving(true);
    try {
      await removeAvatar();
      await refresh();
      toast.success('Profile picture removed.');
    } catch (err) {
      setError(err.message);
    }
    setRemoving(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <AvatarButton user={shownUser} size={96} onFile={pick} disabled={removing} />
      <div className="min-w-0">
        {me?.user?.hasCustomAvatar && (
          <Button onClick={remove} loading={removing}>Remove photo</Button>
        )}
        <p role="alert" className="text-[13px] text-bad-fg empty:hidden">{error}</p>
      </div>
      <AvatarEditor file={file} onClose={() => setFile(null)} onSave={save} />
    </div>
  );
}

function SignInMethod({ provider }) {
  const google = provider === 'google.com';
  const row = 'flex items-center gap-3 text-base';
  const note = 'text-sm text-fg-2';
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      <li className={google ? row : `${row} text-fg-2`}>
        <GoogleMark />
        <span>Google <span className={note}>· {google ? 'connected' : 'not used for this account'}</span></span>
      </li>
      <li className={google ? `${row} text-fg-2` : row}>
        <KeyRound aria-hidden className="h-[18px] w-[18px] shrink-0 text-fg-3" />
        <span>Password <span className={note}>· {google ? 'not set (you log in with Google)' : 'set'}</span></span>
      </li>
    </ul>
  );
}

function Allowance({ me, error, loading, refresh }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => { setRetrying(true); await refresh(); setRetrying(false); };

  if (me?.usage && me?.limits) {
    return (
      <div className="flex flex-col gap-[18px]">
        <UsageMeter label="Fresh analyses" used={me.usage.analyses} limit={me.limits.analyses} />
        <UsageMeter label="Make it drafts" used={me.usage.briefs} limit={me.limits.briefs} />
        <p className="text-[13px] leading-normal text-fg-3">Free during beta. Reopening a saved report doesn’t use any.</p>
      </div>
    );
  }
  if (error && !loading) {
    return (
      <Alert
        tone="warn"
        title="We couldn’t load your allowance."
        action={<Button variant="secondary" loading={retrying} onClick={retry}>Retry</Button>}
      >
        Check your connection and try again. Nothing has been used up.
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-[18px]" role="status" aria-label="Loading your allowance">
      <div><Skeleton className="h-4 w-full" /><Skeleton className="mt-3 h-1.5 w-full" /></div>
      <div><Skeleton className="h-4 w-full" /><Skeleton className="mt-3 h-1.5 w-full" /></div>
    </div>
  );
}

const CHOICES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** System / Light / Dark, shared with the switch in the header. */
function Appearance() {
  const { choice, choose } = useColorMode();
  return (
    <SlideGroup
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex rounded-full bg-surface-2 p-1"
      pillClassName="bg-surface shadow-[0_6px_18px_-10px_var(--scrim)]"
      hoverClassName="bg-hover"
    >
      {CHOICES.map((c) => {
        const on = choice === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            data-slide-item
            data-active={on}
            aria-checked={on}
            onClick={() => choose(c.value)}
            className={cx(SLIDE_ITEM, 'min-h-10 rounded-full px-5 text-[15px] transition-colors duration-300', on ? 'font-semibold text-fg' : 'text-fg-2 hover:text-fg')}
          >
            {c.label}
          </button>
        );
      })}
    </SlideGroup>
  );
}

/** Your account: who you are, how you log in, today's allowance, your data, log out, delete. */
export default function Profile() {
  const { user, signOutUser } = useAuth();
  const { me, error, loading, refresh } = useMe();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null; // the route guard sends a logged-out visitor to log in

  const since = memberSince(user.createdAt ?? me?.user?.createdAt);
  const display = user.name || user.email?.split('@')[0] || 'Your account';
  // The server knows about an uploaded picture; Firebase only knows the Google one.
  const shownUser = { ...user, photoUrl: me?.user?.photoUrl ?? user.photoUrl };

  const logOut = async () => {
    setLoggingOut(true);
    try {
      await signOutUser();
      navigate('/');
    } catch (err) {
      toast.error(err.message);
      setLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-[880px]">
      <header className="flex flex-wrap items-center gap-5">
        <div className="min-w-0">
          <h1 className="break-words text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">{display}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-base text-fg-2">
            <span className="break-all">{user.email}</span>
            {since && <span>· member since {since}</span>}
          </div>
        </div>
      </header>

      <Panel padding="none" className="mt-7 divide-y divide-line">
        <SettingRow title="Profile picture" description="Shown in the top bar.">
          <PictureForm shownUser={shownUser} />
        </SettingRow>

        <SettingRow title="Name" description="Shown on your dashboard.">
          <NameForm user={user} />
        </SettingRow>

        <SettingRow title="Sign-in method" description="How you log in to Gapstronaut.">
          <SignInMethod provider={user.provider} />
        </SettingRow>

        <SettingRow title="Today’s allowance" description={resetsText(me?.resetsAt)}>
          <Allowance me={me} error={error} loading={loading} refresh={refresh} />
        </SettingRow>

        <SettingRow title="Appearance" description="Light is Lunar Cream, dark is Graphite Mono. System follows your device.">
          <Appearance />
        </SettingRow>

        <SettingRow title="Your data" description="What we keep.">
          <p className="text-[15px] leading-relaxed text-fg-2">
            Your reports and drafts are kept for 30 days, then removed. Your account details stay until you delete the account.{' '}
            <Link href="/privacy" className="font-semibold text-fg underline underline-offset-2 hover:text-focus">
              Read the Privacy Policy
            </Link>
          </p>
        </SettingRow>

        <SettingRow title="Log out" description="End this session on this device.">
          <Button variant="secondary" onClick={logOut} loading={loggingOut}>Log out</Button>
        </SettingRow>

        <SettingRow danger title="Delete account" description="Removes your account, usage, watches and saved links to reports. This can’t be undone.">
          <Button variant="secondary" className="border-bad-fg/50! text-bad-fg!" onClick={() => setDeleting(true)}>
            Delete my account
          </Button>
        </SettingRow>
      </Panel>

      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </div>
  );
}
