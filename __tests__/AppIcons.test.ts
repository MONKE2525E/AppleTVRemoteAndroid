import { lookupAppleArtwork, rokuIconUri } from '../src/appletv/appIcons';

const roku = { id: 'r', name: 'Den', address: '192.168.1.20', port: 8060, model: 'Roku TV', identifier: 'roku:1' };

test('Roku icons come straight from the TV over ECP', () => {
  expect(rokuIconUri(roku, 'tvinput.hdmi1')).toBe('http://192.168.1.20:8060/query/icon/tvinput.hdmi1');
});

test('Apple TV artwork prefers tvOS art, falls back to iOS, and skips built-in apps', async () => {
  const fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => ({
      results: url.includes('entity=tvSoftware')
        ? [{ bundleId: 'com.netflix.Netflix', artworkUrl512: 'tv-netflix.jpg' }]
        : [{ bundleId: 'com.plexapp.plex', artworkUrl512: 'ios-plex.jpg' }],
    }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const ids = ['com.netflix.Netflix', 'com.plexapp.plex', 'com.apple.TVSettings'];
  expect(await lookupAppleArtwork(ids)).toEqual({
    'com.netflix.Netflix': 'tv-netflix.jpg',
    'com.plexapp.plex': 'ios-plex.jpg',
  });
  expect(fetchMock.mock.calls.every(([url]) => !url.includes('com.apple.'))).toBe(true);

  fetchMock.mockClear();
  await lookupAppleArtwork(ids);
  expect(fetchMock).not.toHaveBeenCalled();
});
