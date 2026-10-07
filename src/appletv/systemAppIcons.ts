import type { ImageSourcePropType } from 'react-native';

// tvOS system apps use different bundle IDs from their App Store equivalents.
// Bundle Apple's tvOS artwork so these icons work offline and in every region.
// Asset sources and Apple-confirmed bundle IDs are in assets/apple-tv/sources.json.
const SYSTEM_APP_ICONS: Record<string, ImageSourcePropType> = {
  'com.apple.TVAppStore': require('../assets/apple-tv/appstore.png'),
  'com.apple.Arcade': require('../assets/apple-tv/arcade.png'),
  'com.apple.facetime': require('../assets/apple-tv/facetime.png'),
  'com.apple.Fitness': require('../assets/apple-tv/fitness.png'),
  'com.apple.TVHomeSharing': require('../assets/apple-tv/computers.png'),
  'com.apple.TVMovies': require('../assets/apple-tv/movies.png'),
  'com.apple.TVMusic': require('../assets/apple-tv/music.png'),
  'com.apple.TVPhotos': require('../assets/apple-tv/photos.png'),
  'com.apple.podcasts': require('../assets/apple-tv/podcasts.png'),
  'com.apple.TVSearch': require('../assets/apple-tv/search.png'),
  'com.apple.TVSettings': require('../assets/apple-tv/settings.png'),
  'com.apple.Sing': require('../assets/apple-tv/sing.png'),
  'com.apple.TVWatchList': require('../assets/apple-tv/tv.png'),
  'com.apple.TVShows': require('../assets/apple-tv/tvshows.png'),
};

export function systemAppIcon(bundleId: string): ImageSourcePropType | null {
  return SYSTEM_APP_ICONS[bundleId] ?? null;
}
