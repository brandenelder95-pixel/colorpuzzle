/**
 * Web stub for react-native-reanimated.
 *
 * We never import Reanimated in our app code — all animations use React
 * Native's built-in Animated API. Reanimated is only present because it's
 * a transitive peer dependency. On web it tries to use native globals
 * (__reanimatedLoggerConfig, etc.) that don't exist without its Babel plugin,
 * crashing the bundle before the app renders.
 *
 * This stub satisfies any transitive require('react-native-reanimated') calls
 * with no-ops so the web build loads cleanly.
 */
'use strict';

const { View, Text, ScrollView } = require('react-native');

const noop = () => {};
const identity = (v) => v;

module.exports = {
  // Shared values
  useSharedValue: (init) => ({ value: init }),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedRef: () => ({ current: null }),

  // Animated styles / props
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => ({}),
  useAnimatedScrollHandler: () => ({}),
  useAnimatedGestureHandler: () => ({}),

  // Animation functions — return target value immediately (no animation on web)
  withTiming: (toValue) => toValue,
  withSpring: (toValue) => toValue,
  withDecay: (config) => config.velocity ?? 0,
  withDelay: (_delay, animation) => animation,
  withRepeat: (animation) => animation,
  withSequence: (...animations) => animations[animations.length - 1],

  // Utilities
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  cancelAnimation: noop,
  interpolate: (value, _input, output) => output[0],
  interpolateColor: (_v, _i, output) => output[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: {
    linear: identity,
    ease: identity,
    quad: identity,
    cubic: identity,
    in: identity,
    out: identity,
    inOut: identity,
    bezier: () => identity,
    circle: identity,
    sin: identity,
    exp: identity,
    elastic: () => identity,
    bounce: identity,
    back: () => identity,
  },

  // createAnimatedComponent — called by gesture-handler and other libs.
  // On web just return the component unchanged.
  createAnimatedComponent: (component) => component,

  // default export mirrors the module so callers using
  // `import Reanimated from 'react-native-reanimated'`
  // or `Reanimated.default.createAnimatedComponent` work too.
  default: {
    createAnimatedComponent: (component) => component,
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (v) => v,
    withSpring: (v) => v,
  },
};
