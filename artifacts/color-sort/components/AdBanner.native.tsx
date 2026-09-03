import React from 'react';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_AD_UNIT_ID } from '@/utils/ads';
import { canRequestAds, isNonPersonalized } from '@/utils/consent';

export default function AdBanner() {
  // Render nothing when UMP has not granted ad-request permission.
  if (!canRequestAds()) return null;

  return (
    <BannerAd
      unitId={BANNER_AD_UNIT_ID}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: isNonPersonalized() }}
    />
  );
}
