import logger from 'cozy-logger'
import CozyClient from 'cozy-client'
import { initTranslation } from 'cozy-ui/react/I18n/translation'

import BalanceLower from './BalanceLower'
import TransactionGreater from './TransactionGreater'
import HealthBillLinked from './HealthBillLinked'
import LateHealthReimbursement from './LateHealthReimbursement'
import DelayedDebit from './DelayedDebit'

import { BankAccount } from 'models'
import { sendNotification } from 'cozy-notifications'
import { GROUP_DOCTYPE } from 'doctypes'

const log = logger.namespace('notification-service')

const lang = process.env.COZY_LOCALE || 'en'
const dictRequire = lang => require(`../../locales/${lang}`)
const translation = initTranslation(lang, dictRequire)
const t = translation.t.bind(translation)

const notificationClasses = [
  BalanceLower,
  TransactionGreater,
  HealthBillLinked,
  LateHealthReimbursement,
  DelayedDebit
]

const setDifference = (a, b) => {
  return new Set([...a].filter(x => !b.has(x)))
}

export const fetchTransactionAccounts = async transactions => {
  const accountsIds = new Set(transactions.map(x => x.account))
  const accounts = await BankAccount.getAll(Array.from(accountsIds))
  const existingAccountIds = new Set(accounts.map(x => x._id))
  const absentAccountIds = setDifference(accountsIds, existingAccountIds)

  const delta = accountsIds.size - existingAccountIds.size
  if (delta) {
    log(
      'warn',
      `${delta} account(s) do not exist (ids: ${Array.from(
        absentAccountIds
      ).join(',')})`
    )
  }

  return accounts
}

export const fetchGroups = async client => {
  const groups = await client.query(client.all(GROUP_DOCTYPE))
  return groups
}

/**
 * Returns notification rules for a type of notification
 *
 * Must support old unary notifications and new plural notifications
 * where a single class can have several alert.
 */
const getClassRules = (Klass, config) => {
  const classRules = config.notifications[Klass.settingKey]
  if (typeof classRules === 'object' && !Array.isArray(classRules)) {
    return [classRules]
  } else {
    return classRules || []
  }
}

const getValidClassRules = (Klass, config) => {
  const rules = getClassRules(Klass, config)
  return Klass.isValidRule
    ? rules.filter(rule => Klass.isValidRule(rule))
    : rules
}

const isNotificationKlassEnabledFromConfig = config => Klass => {
  const rules = getValidClassRules(Klass, config)
  let enabled = rules && rules.some(rule => rule.enabled)
  log('info', `${Klass.settingKey} is ${enabled ? '' : 'not'} enabled`)
  return enabled
}

export const getEnabledNotificationClasses = config => {
  return notificationClasses.filter(
    isNotificationKlassEnabledFromConfig(config)
  )
}

const isKlassSupportingSeveralRules = Klass => Klass.supportsMultipleRules

export const sendNotificationForClass = async (
  Klass,
  { config, client, data, lang }
) => {
  const klassRules = getClassRules(Klass, config)
  const klassOptions = {
    client,
    t,
    locales: {
      [lang]: dictRequire(lang)
    },
    lang,
    data
  }
  if (isKlassSupportingSeveralRules(Klass)) {
    klassOptions.rules = klassRules
  } else {
    Object.assign(klassOptions, klassRules[0])
  }
  const notificationView = new Klass(klassOptions)
  try {
    await sendNotification(client, notificationView)
  } catch (err) {
    log('warn', JSON.stringify(err))
  }
}

export const sendNotifications = async (config, transactions) => {
  const enabledNotificationClasses = getEnabledNotificationClasses(config)
  const client = CozyClient.fromEnv(process.env)
  const accounts = await fetchTransactionAccounts(transactions)
  const groups = await fetchGroups(client)
  log(
    'info',
    `${transactions.length} new transactions on ${accounts.length} accounts.`
  )
  for (const Klass of enabledNotificationClasses) {
    await sendNotificationForClass(Klass, {
      client,
      lang,
      config,
      data: {
        accounts,
        groups,
        transactions
      }
    })
  }
}
