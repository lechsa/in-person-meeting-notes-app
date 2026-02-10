import { ConfigPlugin } from 'expo/config-plugins';
import { withBackgroundAudioIOS } from './withBackgroundAudioIOS';
import { withBackgroundAudioAndroid } from './withBackgroundAudioAndroid';

const withBackgroundAudio: ConfigPlugin = (config) => {
  config = withBackgroundAudioIOS(config);
  config = withBackgroundAudioAndroid(config);
  return config;
};

export default withBackgroundAudio;
