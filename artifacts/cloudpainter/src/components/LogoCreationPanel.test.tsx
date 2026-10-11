import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { LogoCreationPanel, MAX_CONCEPTS, PROMPT_MAX, TIMEOUT_MS, type LogoDirectionOption } from './LogoCreationPanel';

const { generate, account, configuration } = vi.hoisted(() => ({
  generate: vi.fn(),
  account: { isLoaded: true, userId: 'account-1' as string | null, sessionId: 'session-1' as string | null },
  configuration: { current: null as null | {
    data: { configured: boolean; signedIn: boolean; allowed: boolean; dailyLimit: number; remaining: number; globalRemaining: number };
    isError: boolean;
    isLoading: boolean;
  } },
}));
vi.mock('@workspace/api-client-react', () => ({
  generateLogoImage: (...a: unknown[]) => generate(...a),
  getGetImageGenerationConfigQueryKey: () => ['getImageGenerationConfig'],
  useGetImageGenerationConfig: () => configuration.current,
}));
vi.mock('./Account', () => ({ usePaletteAccount: () => account }));
vi.mock('@clerk/react', () => ({ SignInButton: ({ children }: { children: ReactNode }) => children }));

const directions: LogoDirectionOption[] = [
  { id: 'cloudline', number: '01', name: 'Cloudline', description: 'A quiet sky shape.' },
  { id: 'sunstudy', number: '05', name: 'Weather note', description: 'A tiny sun.' },
];
const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(1)];
const PNG = btoa(String.fromCharCode(...header));
const ok = { pngBase64: PNG, width: 1024, height: 1024 };
const apiError = (code: string, retryable: boolean, status = 503) =>
  Object.assign(new Error('<html>secret internals</html>'), { status, data: { code, message: 'raw server text', retryable } });

let n = 0;
let create: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  generate.mockReset();
  account.isLoaded = true;
  account.userId = 'account-1';
  account.sessionId = 'session-1';
  configuration.current = {
    data: { configured: true, signedIn: true, allowed: true, dailyLimit: 2, remaining: 2, globalRemaining: 20 },
    isError: false,
    isLoading: false,
  };
  n = 0;
  create = vi.fn(() => `blob:test-${++n}`);
  revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const type = (v: string) => fireEvent.change(screen.getByTestId('input-logo-prompt'), { target: { value: v } });
const submit = () => fireEvent.click(screen.getByTestId('button-generate-logo'));
const setup = () => render(<LogoCreationPanel logoDirections={directions} />);

describe('LogoCreationPanel', () => {
  it('rejects empty and oversized prompts without calling the API', () => {
    setup();
    submit();
    expect(screen.getByRole('alert').textContent).toMatch(/Describe the logo concept/);
    type('x'.repeat(PROMPT_MAX + 1));
    submit();
    expect(screen.getByRole('alert').textContent).toMatch(/1200/);
    expect(generate).not.toHaveBeenCalled();
  });

  it('succeeds, sends direction and signal, and downloads a PNG', async () => {
    generate.mockResolvedValue(ok);
    setup();
    type('a cloud');
    fireEvent.change(screen.getByTestId('select-logo-direction'), { target: { value: 'cloudline' } });
    submit();
    await screen.findByTestId('img-logo-result-1');
    const [req, opts] = generate.mock.calls[0];
    expect(req).toEqual({ prompt: 'a cloud', direction: 'cloudline' });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.headers).toEqual({ 'X-Logo-Session': 'session-1' });
    let name = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    fireEvent.click(screen.getByTestId('button-download-logo-1'));
    expect(name).toBe('cloudpainter-logo-concept-1.png');
    click.mockRestore();
  });

  it('gates logo requests for signed-out accounts', () => {
    account.userId = null;
    account.sessionId = null;
    setup();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect((screen.getByTestId('button-generate-logo') as HTMLButtonElement).disabled).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it('aborts and clears logo work when the signed-in account changes', async () => {
    let resolve!: (value: unknown) => void;
    generate.mockResolvedValueOnce(ok).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const view = setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    submit();
    const signal = generate.mock.calls[1][1].signal as AbortSignal;

    act(() => {
      account.userId = 'account-2';
      account.sessionId = 'session-2';
      view.rerender(<LogoCreationPanel logoDirections={directions} />);
    });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('img')).toBeNull();
    expect((screen.getByTestId('input-logo-prompt') as HTMLTextAreaElement).value).toBe('');
    expect(revoke.mock.calls).toEqual([['blob:test-1']]);

    await act(async () => { resolve(ok); });
    expect(screen.queryByRole('img')).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('shows only safe messages and keeps the previous result on error', async () => {
    generate.mockResolvedValueOnce(ok);
    setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    generate.mockResolvedValueOnce(ok);
    submit();
    await screen.findByTestId('img-logo-result-2');
    generate.mockRejectedValueOnce(apiError('BUSY', true));
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/busy/));
    expect(document.body.textContent).not.toMatch(/secret|raw server/);
    expect(screen.getByTestId('img-logo-result-1').getAttribute('src')).toBe('blob:test-1');
    expect(screen.getByTestId('img-logo-result-2').getAttribute('src')).toBe('blob:test-2');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('retries retryable failures only', async () => {
    generate.mockRejectedValueOnce(apiError('PROVIDER_FAILED', true)).mockResolvedValueOnce(ok);
    setup();
    type('a cloud');
    submit();
    fireEvent.click(await screen.findByTestId('button-retry-logo'));
    await screen.findByTestId('img-logo-result-1');
    expect(generate).toHaveBeenCalledTimes(2);
    generate.mockRejectedValueOnce(apiError('REFUSED', false, 422));
    submit();
    await screen.findByRole('alert');
    expect(screen.queryByTestId('button-retry-logo')).toBeNull();
  });

  it('guards duplicate submits while in flight', async () => {
    let resolve!: (v: unknown) => void;
    generate.mockReturnValue(new Promise(r => { resolve = r; }));
    setup();
    type('a cloud');
    const form = screen.getByTestId('button-generate-logo').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('button-generate-logo') as HTMLButtonElement).disabled).toBe(true);
    expect(form.getAttribute('aria-busy')).toBe('true');
    resolve(ok);
    await screen.findByTestId('img-logo-result-1');
  });

  it('rejects invalid image data', async () => {
    generate.mockResolvedValue({ ...ok, pngBase64: btoa('not a png at all, definitely') });
    setup();
    type('a cloud');
    submit();
    await screen.findByRole('alert');
    expect(create).not.toHaveBeenCalled();
  });

  it('times out, aborts the request, and offers a retry', async () => {
    vi.useFakeTimers();
    generate.mockImplementation((_body, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    setup();
    type('a cloud');
    submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMEOUT_MS); });
    expect(screen.getByRole('alert').textContent).toMatch(/too long/);
    expect(screen.getByTestId('button-retry-logo')).toBeTruthy();
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('uses safe generic errors for HTML/offline failures and never renders raw text', async () => {
    generate.mockRejectedValue(new Error('<html>PRIVATE credentials</html>'));
    setup();
    type('a cloud');
    submit();
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toMatch(/PRIVATE|credentials|html/);
    expect(screen.getByTestId('button-retry-logo')).toBeTruthy();
  });

  it('consumes normalized errors through the real generated fetch client', async () => {
    const actual = await vi.importActual<typeof import('@workspace/api-client-react')>('@workspace/api-client-react');
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      code: 'REFUSED', message: 'raw internal text', retryable: false,
    }, { status: 422 })).mockResolvedValueOnce(Response.json({
      code: 'UNAVAILABLE', message: 'raw private configuration', retryable: true,
    }, { status: 503 })).mockResolvedValueOnce(Response.json({
      code: 'budget_unavailable', message: 'database internals', retryable: true,
    }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    generate.mockImplementation(actual.generateLogoImage);
    setup();
    type('a cloud');
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/different wording/));
    expect(screen.queryByTestId('button-retry-logo')).toBeNull();
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Poe image generation is unavailable/));
    expect(screen.getByTestId('button-retry-logo')).toBeTruthy();
    fireEvent.click(screen.getByTestId('button-retry-logo'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no logo request was sent/));
    expect(document.body.textContent).not.toMatch(/raw internal|raw private/);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/logo-images');
    expect(JSON.parse(request.body)).toEqual({ prompt: 'a cloud' });
  });

  it('compares and downloads every concept without persisting or replacing results', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    generate.mockResolvedValue(ok);
    const view = setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    submit();
    await screen.findByTestId('img-logo-result-2');
    expect(within(screen.getByTestId('logo-concept-gallery')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByAltText('Generated logo concept 1').getAttribute('src')).toBe('blob:test-1');
    expect(screen.getByAltText('Generated logo concept 2').getAttribute('src')).toBe('blob:test-2');
    expect(revoke).not.toHaveBeenCalled();
    const downloads: { url: string; name: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ url: this.href, name: this.download });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download concept 1 PNG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download concept 2 PNG' }));
    expect(downloads).toEqual([
      { url: 'blob:test-1', name: 'cloudpainter-logo-concept-1.png' },
      { url: 'blob:test-2', name: 'cloudpainter-logo-concept-2.png' },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
    expect(storage).not.toHaveBeenCalled();
    view.unmount();
    expect(revoke.mock.calls).toEqual([['blob:test-1'], ['blob:test-2']]);
    setup();
    expect(screen.queryByRole('img')).toBeNull();
    storage.mockRestore();
  });

  it('caps held images, blocks even direct submits at capacity, and frees a slot on removal', async () => {
    generate.mockResolvedValue(ok);
    const view = setup();
    type('a cloud');
    for (let id = 1; id <= MAX_CONCEPTS; id++) {
      submit();
      await screen.findByTestId(`img-logo-result-${id}`);
    }
    expect(screen.getAllByRole('img')).toHaveLength(MAX_CONCEPTS);
    expect((screen.getByTestId('button-generate-logo') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('text-logo-gallery-limit').textContent).toMatch(/remove a concept/);
    fireEvent.submit(screen.getByTestId('button-generate-logo').closest('form')!);
    expect(generate).toHaveBeenCalledTimes(MAX_CONCEPTS);
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove concept 2' }));
    expect(screen.queryByTestId('img-logo-result-2')).toBeNull();
    expect(revoke.mock.calls).toEqual([['blob:test-2']]);
    expect((screen.getByTestId('button-generate-logo') as HTMLButtonElement).disabled).toBe(false);
    submit();
    await screen.findByTestId(`img-logo-result-${MAX_CONCEPTS + 1}`);
    expect(screen.getAllByRole('img')).toHaveLength(MAX_CONCEPTS);
    view.unmount();
    expect(revoke).toHaveBeenCalledTimes(MAX_CONCEPTS + 1);
    expect(new Set(revoke.mock.calls.map(([url]) => url)).size).toBe(MAX_CONCEPTS + 1);
  });

  it('removes a preview while generating without resurrecting it on success', async () => {
    generate.mockResolvedValueOnce(ok);
    const view = setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    let resolve!: (v: unknown) => void;
    generate.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    submit();
    expect(screen.getByTestId('img-logo-result-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove concept 1' }));
    expect(revoke.mock.calls).toEqual([['blob:test-1']]);
    expect(screen.getByTestId('logo-result-frame').textContent).toMatch(/Sketching/);
    resolve(ok);
    await screen.findByTestId('img-logo-result-2');
    expect(screen.queryByTestId('img-logo-result-1')).toBeNull();
    view.unmount();
    expect(revoke.mock.calls).toEqual([['blob:test-1'], ['blob:test-2']]);
  });

  it('returns to an empty gallery when the last concept is removed', async () => {
    generate.mockResolvedValue(ok);
    setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Remove concept 1' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('button-generate-logo').textContent).toBe('Generate image');
    expect(screen.getByTestId('status-logo-generation').textContent).toBe('');
    expect(revoke.mock.calls).toEqual([['blob:test-1']]);
  });

  it('allows keyboard navigation and generation without a mouse', async () => {
    const user = userEvent.setup();
    generate.mockResolvedValue(ok);
    setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Describe the concept'));
    await user.keyboard('one pencil cloud');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Inspiration direction (optional)'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('button-generate-logo'));
    await user.keyboard('{Enter}');
    await screen.findByTestId('img-logo-result-1');
    expect(generate.mock.calls[0][0]).toEqual({ prompt: 'one pencil cloud' });
  });

  it('aborts on unmount, ignores late resolution, revokes blob URLs', async () => {
    generate.mockResolvedValueOnce(ok);
    const first = setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result-1');
    generate.mockResolvedValueOnce(ok);
    submit();
    await screen.findByTestId('img-logo-result-2');
    let resolve!: (v: unknown) => void;
    generate.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    submit();
    const signal = generate.mock.calls[2][1].signal as AbortSignal;
    first.unmount();
    expect(signal.aborted).toBe(true);
    expect(revoke.mock.calls).toEqual([['blob:test-1'], ['blob:test-2']]);
    resolve(ok);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
