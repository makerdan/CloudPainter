import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OutlinePanel } from './OutlinePanel';
const mocks = vi.hoisted(() => ({
  local: vi.fn(), trace: vi.fn(), hosted: vi.fn(), config: vi.fn(),
  session: 'current-session' as string | null,
}));
vi.mock('./Account', () => ({ usePaletteAccount: () => ({ sessionId: mocks.session, userId: mocks.session, isLoaded: true }) }));
vi.mock('./tooltip-button', () => ({ TooltipButton: ({ description: _description, ...props }: Record<string, unknown>) => <button {...props} /> }));
vi.mock('../lib/outlineInference', () => ({ runLocalOutline: mocks.local, traceImageEdges: mocks.trace }));
vi.mock('../lib/outlineHosted', () => ({ runHostedOutline: mocks.hosted, getOutlineConfig: mocks.config }));
const points = [{x:.1,y:.1},{x:.4,y:.2},{x:.2,y:.5},{x:.1,y:.1}];
const candidates = [{ label: 'cat', points }];
beforeEach(() => {
  mocks.session = 'current-session';
  mocks.local.mockReset().mockResolvedValue(candidates);
  mocks.trace.mockReset().mockResolvedValue(candidates);
  mocks.hosted.mockReset().mockResolvedValue(candidates);
  mocks.config.mockReset().mockResolvedValue({ configured:true,signedIn:true,allowed:true,model:'GPT-Image-2',error:'' });
});
afterEach(cleanup);
const setup = () => {
  const accept = vi.fn(), close = vi.fn();
  const props = { image:'data:image/png;base64,fixture',contextKey:'photo-layer-view-1',onAccept:accept,onClose:close };
  return { accept, close, props, ...render(<OutlinePanel {...props} />) };
};
const click = (id:string) => fireEvent.click(screen.getByTestId(id));
it('defaults to local; preview is read-only until Accept and Cancel never commits', async () => {
  const f = setup();
  expect(screen.getByTestId('button-outline-local').getAttribute('aria-checked')).toBe('true');
  click('button-outline-run');
  await waitFor(() => expect(screen.getByTestId('button-outline-accept').hasAttribute('disabled')).toBe(false));
  expect(f.accept).not.toHaveBeenCalled();
  expect(mocks.hosted).not.toHaveBeenCalled();
  click('button-outline-accept');
  expect(f.accept).toHaveBeenCalledWith(points);
});
it('edge tracing has no hosted transport; cancellation aborts and ignores late results', async () => {
  let resolve!: (result:typeof candidates) => void;
  mocks.trace.mockImplementation(() => new Promise(r => { resolve = r; }));
  const f = setup(); click('button-outline-trace'); click('button-outline-run');
  const signal = mocks.trace.mock.calls[0][3] as AbortSignal;
  click('button-outline-cancel');
  expect(signal.aborted).toBe(true); expect(f.close).toHaveBeenCalledOnce();
  await act(async () => resolve(candidates));
  expect(f.accept).not.toHaveBeenCalled(); expect(mocks.hosted).not.toHaveBeenCalled();
});
it('changed photo/view/layer identity and changed account discard in-flight results', async () => {
  let resolve!: (result:typeof candidates) => void;
  mocks.local.mockImplementation(() => new Promise(r => { resolve = r; }));
  const f = setup(); click('button-outline-run');
  f.rerender(<OutlinePanel {...f.props} contextKey="different-photo-layer-or-view" />);
  expect((mocks.local.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
  await act(async () => resolve(candidates));
  expect(screen.getByTestId('button-outline-accept').hasAttribute('disabled')).toBe(true);
  expect(f.accept).not.toHaveBeenCalled();
});
it('hosted requires configuration, subject, session and explicit consent; local never sends', async () => {
  setup(); click('button-outline-hosted');
  await waitFor(() => expect(screen.getByTestId('checkbox-outline-consent').hasAttribute('disabled')).toBe(false));
  expect(screen.getByTestId('button-outline-run').hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByTestId('input-outline-subject'), {target:{value:'left cat'}});
  expect(screen.getByTestId('button-outline-run').hasAttribute('disabled')).toBe(true);
  click('checkbox-outline-consent'); click('button-outline-run');
  await waitFor(() => expect(mocks.hosted).toHaveBeenCalledOnce());
  expect(mocks.hosted.mock.calls[0].slice(3,6)).toEqual(['left cat',true,'current-session']);
  expect(mocks.local).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('input-outline-sensitivity'), {target:{value:'.7'}});
  expect((screen.getByTestId('checkbox-outline-consent') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByTestId('button-outline-accept').hasAttribute('disabled')).toBe(true);
});
it('account changes revoke consent and cancel pending hosted output', async () => {
  let resolve!: (result:typeof candidates) => void;
  mocks.hosted.mockImplementation(() => new Promise(r => { resolve = r; }));
  const f = setup(); click('button-outline-hosted');
  await waitFor(() => expect(screen.getByTestId('checkbox-outline-consent').hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByTestId('input-outline-subject'), {target:{value:'dog'}});
  click('checkbox-outline-consent'); click('button-outline-run');
  const signal = mocks.hosted.mock.calls[0][6] as AbortSignal;
  mocks.session = null;
  f.rerender(<OutlinePanel {...f.props} />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(candidates));
  expect(f.accept).not.toHaveBeenCalled();
  expect((screen.getByTestId('checkbox-outline-consent') as HTMLInputElement).checked).toBe(false);
});
it('provider unavailable, empty candidates and model failure are visible and safe', async () => {
  mocks.config.mockResolvedValue({configured:false,signedIn:true,allowed:false,error:'Poe is not configured.'});
  setup(); click('button-outline-hosted');
  await waitFor(() => expect(screen.getByTestId('status-outline-blocked').textContent).toContain('not configured'));
  expect(screen.getByTestId('button-outline-run').hasAttribute('disabled')).toBe(true);
  click('button-outline-local'); mocks.local.mockResolvedValueOnce([]); click('button-outline-run');
  await waitFor(() => expect(screen.getByTestId('status-outline').textContent).toContain('No candidates'));
  mocks.local.mockRejectedValueOnce(new Error('Model download unavailable')); click('button-outline-run');
  await waitFor(() => expect(screen.getByTestId('status-outline').textContent).toContain('Model download unavailable'));
  expect(mocks.hosted).not.toHaveBeenCalled();
});
it('explains when the local model filters photo-wide background results', async () => {
  mocks.local.mockImplementationOnce(async (_image: string, _region: unknown, _sensitivity: number, _signal: AbortSignal, onStatus: (message: string) => void) => {
    onStatus('Ignored 1 photo-wide result that looked like the background rather than a useful subject outline.');
    return candidates;
  });
  const f = setup(); click('button-outline-run');
  await waitFor(() => expect(screen.getByTestId('status-outline').textContent).toContain('Ignored 1 photo-wide result'));
  expect(screen.getByTestId('button-outline-accept').hasAttribute('disabled')).toBe(false);
  click('button-outline-accept');
  expect(f.accept).toHaveBeenCalledWith(points);
});
