import { lookupAppleArtwork, rokuIconUri, storefronts } from '../src/appletv/appIcons';
import NativeAppSettings from '../src/specs/NativeAppSettings';

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

test('regional apps resolve from the phone country store before falling back to the US', async () => {
  jest.mocked(NativeAppSettings.getCountryCodes).mockResolvedValueOnce(['ca', 'us']);
  const fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => ({
      results:
        url.includes('country=ca') && url.includes('entity=tvSoftware')
          ? [{ bundleId: 'ca.cbc.CBCTV', artworkUrl512: 'ca-gem.jpg' }]
          : url.includes('country=us') && !url.includes('entity=')
            ? [{ bundleId: 'com.example.usonly', artworkUrl512: 'us-only.jpg' }]
            : [],
    }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  expect(await lookupAppleArtwork(['ca.cbc.CBCTV', 'com.example.usonly'])).toEqual({
    'ca.cbc.CBCTV': 'ca-gem.jpg',
    'com.example.usonly': 'us-only.jpg',
  });
  // Once Gem is found in the Canadian store it isn't requested again elsewhere.
  const usCalls = fetchMock.mock.calls.map(([url]) => url).filter(url => url.includes('country=us'));
  expect(usCalls.every(url => !url.includes('CBCTV'))).toBe(true);
});

test('all reported countries are tried once, with a US fallback', async () => {
  jest.mocked(NativeAppSettings.getCountryCodes).mockResolvedValueOnce(['GB', 'de', 'gb']);
  expect(await storefronts()).toEqual(['gb', 'de', 'us']);
});

test('regional artwork outside Canada resolves from its own storefront', async () => {
  jest.mocked(NativeAppSettings.getCountryCodes).mockResolvedValueOnce(['gb']);
  const fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => ({
      results: url.includes('country=gb')
        ? [{ bundleId: 'uk.example.regional', artworkUrl512: 'uk-art.jpg' }]
        : [],
    }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  expect(await lookupAppleArtwork(['uk.example.regional'])).toEqual({
    'uk.example.regional': 'uk-art.jpg',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('phones without country information or an available native method use the US fallback', async () => {
  jest.mocked(NativeAppSettings.getCountryCodes).mockResolvedValueOnce([]);
  expect(await storefronts()).toEqual(['us']);
  jest.mocked(NativeAppSettings.getCountryCodes).mockRejectedValueOnce(new Error('Unavailable'));
  expect(await storefronts()).toEqual(['us']);
});
