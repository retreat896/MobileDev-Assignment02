module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['@babel/plugin-syntax-jsx'],
    [
      'module-resolver',
      {
        alias: {
          'crypto': 'react-native-quick-crypto',
          'stream': 'stream-browserify',
          'buffer': '@craftzdog/react-native-buffer',
        },
      },
    ],
  ]
};
