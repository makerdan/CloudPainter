import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, useLocation } from 'wouter';
import { TooltipButton } from './tooltip-button';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}
const AccountContext = createContext({ leaving: false, setLeaving: (_value: boolean) => {} });

export function AccountProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [leaving, setLeaving] = useState(false);
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    signInFallbackRedirectUrl={basePath || '/'}
    signUpFallbackRedirectUrl={basePath || '/'}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    appearance={{
      theme: shadcn,
      cssLayerName: 'clerk',
      options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
      variables: { fontFamily: 'DM Sans, sans-serif', colorPrimary: '#315d4d', colorForeground: '#28352d',
        colorMutedForeground: '#526057', colorBackground: '#fbfaf6', colorInput: '#ffffff',
        colorInputForeground: '#28352d', colorDanger: '#b42318', colorNeutral: '#28352d', borderRadius: '12px' },
      elements: {
        cardBox: { width: '440px', maxWidth: '100%', background: '#fbfaf6' },
        card: { background: 'transparent' }, footer: { background: '#fbfaf6' },
        headerTitle: { color: '#28352d' }, headerSubtitle: { color: '#526057' },
        socialButtonsBlockButtonText: { color: '#28352d' }, formFieldLabel: { color: '#28352d' },
        footerActionLink: { color: '#315d4d' }, footerActionText: { color: '#526057' },
        dividerText: { color: '#526057' }, identityPreviewEditButton: { color: '#315d4d' },
        formFieldSuccessText: { color: '#315d4d' }, alertText: { color: '#28352d' },
        formButtonPrimary: { color: '#ffffff', background: '#315d4d' },
      },
    }}
    localization={{
      signIn: { start: { title: 'Welcome to CloudPainter', subtitle: 'Sign in to save your personal colors' } },
      signUp: { start: { title: 'Create your CloudPainter account', subtitle: 'Keep your palette across devices' } },
    }}
  ><AccountContext.Provider value={{ leaving, setLeaving }}>{children}</AccountContext.Provider></ClerkProvider>;
}
export function usePaletteAccount() {
  const { isLoaded, userId, sessionId } = useAuth();
  const { leaving } = useContext(AccountContext);
  return { isLoaded, userId: leaving ? null : userId, sessionId: leaving ? null : sessionId };
}
export function AccountControls() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { leaving, setLeaving } = useContext(AccountContext);
  const [error, setError] = useState('');
  if (!isLoaded) return <span className="account-note">Loading account…</span>;
  if (!isSignedIn) return <div className="account-controls"><Link className="button button-small" href="/sign-in">Sign in</Link><Link className="button button-small" href="/sign-up">Create account</Link></div>;
  return <div className="account-controls">
    <span className="account-note" data-testid="account-name">{user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Your account'}</span>
    <TooltipButton className="button button-small" disabled={leaving}
      description="Sign out and hide your account palette. Your browser-local drawing stays on this device."
      onClick={async () => {
        setLeaving(true); setError('');
        try { await signOut({ redirectUrl: basePath || '/' }); }
        catch { setLeaving(false); setError('Sign-out failed. Please retry.'); }
      }}>{leaving ? 'Signing out…' : 'Sign out'}</TooltipButton>
    {error && <span role="alert" className="generation-error">{error}</span>}
  </div>;
}
export function SignInPage() {
  return <div className="account-page"><Link href="/">Back to your drawing</Link>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallback={<AccountLoading />} />
    <p>Only palettes are saved to your account. Projects and photos stay in this browser.</p>
  </div>;
}
export function SignUpPage() {
  return <div className="account-page"><Link href="/">Back to your drawing</Link>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallback={<AccountLoading />} />
    <p>Only palettes are saved to your account. Projects and photos stay in this browser.</p>
  </div>;
}
function AccountLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="account-loading" role="status">
    <p>{slow ? 'Account access is taking longer than expected. Your local drawing is safe.' : 'Loading secure account form…'}</p>
    {slow && <TooltipButton className="button" description="Reload the account screen and retry the secure connection; your browser-local drawing is unchanged." onClick={() => window.location.reload()}>Retry account connection</TooltipButton>}
  </div>;
}
