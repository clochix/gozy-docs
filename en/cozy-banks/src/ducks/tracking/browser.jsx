/* global __PIWIK_TRACKER_URL__, __PIWIK_SITEID__ */

import React, { useContext, createContext, useEffect } from 'react'
import memoize from 'lodash/memoize'

import flag from 'cozy-flags'
import { getTracker as uiGetTracker } from 'cozy-ui/transpiled/react/helpers/tracker'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

// Necessary for cozy-ui
window.__PIWIK_DIMENSION_ID_APP__ = 1

const trackerShim = {
  trackPage: () => {},
  trackEvent: () => {},
  push: () => {}
}

export const getMatomoTracker = memoize(() => {
  const trackerInstance = uiGetTracker(
    __PIWIK_TRACKER_URL__,
    __PIWIK_SITEID__,
    true, //
    false
  )

  if (!trackerInstance) {
    return trackerShim
  }

  trackerInstance.push([
    'setTrackerUrl',
    'https://matomo.cozycloud.cc/matomo.php'
  ])
  trackerInstance.push(['setSiteId', 8])

  return {
    trackEvent: event => {
      const { name, action, category } = event
      if (!name) {
        throw new Error('An event must have at least a name')
      }
      if (flag('banks.show-tracking-alerts')) {
        Alerter.info(`Tracking event: ${JSON.stringify(event)}`)
      }
      trackerInstance.push(['trackEvent', category, name, action])
    },
    trackPage: pagePath => {
      const message = `Tracking page ${pagePath}`
      if (flag('banks.show-tracking-alerts')) {
        Alerter.info(message)
      }
      trackerInstance.push([
        'setCustomUrl',
        'https://cozy-banks/' + pagePath.replace(/:/g, '/')
      ])
      trackerInstance.push(['trackPageView'])
    }
  }
})

export const getTracker = getMatomoTracker

export const trackEvent = options => {
  const tracker = getTracker()
  tracker.trackEvent(options)
}

export const trackPage = options => {
  const tracker = getTracker()
  tracker.trackPage(options)
}

export const TrackerContext = createContext()

export const TrackerProvider = ({ children }) => {
  const tracker = getTracker()
  return (
    <TrackerContext.Provider value={tracker}>
      {children}
    </TrackerContext.Provider>
  )
}

export const useTracker = () => {
  return useContext(TrackerContext)
}

export const useTrackPage = pageName => {
  const tracker = useTracker()

  useEffect(() => {
    if (!pageName || !tracker) {
      return
    }
    tracker.trackPage(pageName)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}