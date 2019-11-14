import { merge, get } from 'lodash'
import { DOCTYPE, DEFAULTS_SETTINGS } from 'ducks/settings/constants'
import logger from 'cozy-logger'

const log = logger.namespace('settings.helpers')

export const isNotificationEnabled = settings => {
  return (
    get(settings, 'notifications.balanceLower.enabled') ||
    get(settings, 'notifications.transactionGreater.enabled') ||
    get(settings, 'notifications.healthBillLinked.enabled')
  )
}

export const getDefaultedSettings = incompleteSettings => {
  return merge({}, DEFAULTS_SETTINGS, incompleteSettings)
}

export const fetchSettings = async client => {
  const settingsCol = await client.query(client.find(DOCTYPE))
  return getDefaultedSettingsFromCollection(settingsCol)
}

export const updateSettings = async (client, newSettings) => {
  const col = client.collection(DOCTYPE)
  await col.update(newSettings)
}

export const getDefaultedSettingsFromCollection = col => {
  const settings = get(col, 'data[0]')
  return getDefaultedSettings(settings)
}

export const fetchCategoryAlerts = async client => {
  try {
    const settings = await fetchSettings(client)
    return settings.categoryBudgetAlerts
  } catch (e) {
    log('error', `Error while fetching category alerts (${e.message})`)
    return []
  }
}

export const updateCategoryAlerts = async (client, updatedAlerts) => {
  const settings = await fetchSettings(client)
  settings.categoryBudgetAlerts = updatedAlerts
  return updateSettings(client, settings)
}