import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoCreationPanel, PROMPT_MAX, TIMEOUT_MS, type LogoDirectionOption } from './LogoCreationPanel';

const generate = vi.fn();
vi.mock('@workspace/api-client-react', () => ({ generateLogoImage: (...a: unknown[]) => generate(...a) }));

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
    await screen.findByTestId('img-logo-result');
    const [req, opts] = generate.mock.calls[0];
    expect(req).toEqual({ prompt: 'a cloud', direction: 'cloudline' });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    let name = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    fireEvent.click(screen.getByTestId('button-download-logo'));
    expect(name).toBe('cloudpainter-logo-concept.png');
    click.mockRestore();
  });

  it('shows only safe messages and keeps the previous result on error', async () => {
    generate.mockResolvedValueOnce(ok);
    setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result');
    generate.mockRejectedValueOnce(apiError('BUSY', true));
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/busy/));
    expect(document.body.textContent).not.toMatch(/secret|raw server/);
    expect(screen.getByTestId('img-logo-result')).toBeTruthy();
  });

  it('retries retryable failures only', async () => {
    generate.mockRejectedValueOnce(apiError('PROVIDER_FAILED', true)).mockResolvedValueOnce(ok);
    setup();
    type('a cloud');
    submit();
    fireEvent.click(await screen.findByTestId('button-retry-logo'));
    await screen.findByTestId('img-logo-result');
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
    await screen.findByTestId('img-logo-result');
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
    expect(document.body.textContent).not.toMatch(/raw internal|raw private/);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/logo-images');
    expect(JSON.parse(request.body)).toEqual({ prompt: 'a cloud' });
  });

  it('releases the prior URL on replacement and does not write browser projects', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    generate.mockResolvedValue(ok);
    setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result');
    submit();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
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
    await screen.findByTestId('img-logo-result');
    expect(generate.mock.calls[0][0]).toEqual({ prompt: 'one pencil cloud' });
  });

  it('aborts on unmount, ignores late resolution, revokes blob URLs', async () => {
    generate.mockResolvedValueOnce(ok);
    const first = setup();
    type('a cloud');
    submit();
    await screen.findByTestId('img-logo-result');
    let resolve!: (v: unknown) => void;
    generate.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    submit();
    const signal = generate.mock.calls[1][1].signal as AbortSignal;
    first.unmount();
    expect(signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
    resolve(ok);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
