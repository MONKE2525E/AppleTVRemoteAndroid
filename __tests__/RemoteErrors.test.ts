import NativeAppleTV from '../src/specs/NativeAppleTV';
import { appleTV } from '../src/appletv/client';
import { captureCommandError } from '../src/analytics/analytics';

jest.mock('../src/analytics/analytics', () => ({ captureCommandError: jest.fn() }));

test('a rejected remote command remains safe for the UI and reaches error tracking', async () => {
  const error = Object.assign(new Error('private TV address'), { code: 'IOException' });
  jest.mocked(NativeAppleTV.pressButton).mockRejectedValueOnce(error);
  await expect(appleTV.pressButton('VOLUME_DOWN')).resolves.toBeUndefined();
  expect(captureCommandError).toHaveBeenCalledWith('pressButton', error);
});
