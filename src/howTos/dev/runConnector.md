---
title: Standalone run a connector from an external app
summary: How to run an monitor a connector standalone without any user setup
---

Running a connector is normally handled by the [Home application](https://github.com/cozy/cozy-home)
with [cozy-harvest-lib](https://github.com/cozy/cozy-libs/tree/master/packages/cozy-harvest-lib).
But if you are in an environment which cannot use react (for example in a native application), you will have to run your connector
yourself.

If you are in a Javascript environment, you can use the [cozy-client](/cozy-client/getting-started/) lib.
Or else, you still have the [cozy-stack api](/cozy-stack/#reference).

The whole process is detailed in the [Konnector workflow](/cozy-stack/konnectors-workflow/).
you will get here a practical example.

We will suppose that the cozy url is `https://runconnectordemo.mycozy.cloud` and that the
connector slug is `connectorslug`.

The login will be `userlogin` and the password will be `userpassword`

## Getting an access token

To use the API, you need an access_token via the OAuth2 protocol. createClientInteractive will get
you an initialized cozy-client instance and handle asking user permission for it.
here :

```javascript
const { createClientInteractive } = require('cozy-client/dist/cli')
;(async () => {
  const client = await createClientInteractive({
    uri: 'https://runconnectordemo.mycozy.cloud',
    scope: [
      'io.cozy.triggers',
      'io.cozy.jobs',
      'io.cozy.accounts'
    ],
    oauth: {
      softwareID: 'mynewprogramm',
    }
  })
})
```

[The stack api documentation shows other ways](/cozy-stack/auth/#how-to-register-the-application_1)
to get an access token.

## Create an account

The account will be here to keep the user identifiers.

```javascript
const accountsCollection = client.collection('io.cozy.accounts')
const account = await accountsCollection.create({
  account_type: 'connectorslug',
  auth: {
    login: 'userlogin',
    password: 'userpassword',
  }
})
const accountId = account.data.id
```

Related [API reference](/cozy-stack/data-system/#create-a-document)

## Create a trigger associated to the account

```javascript
const triggerCollection = client.collection('io.cozy.triggers')
const trigger = await triggerCollection.create({
  type: '@cron',
  worker: 'konnector',
  arguments: '0 0 0 1 1 *',
  message: {
    account: accountId,
    konnector: 'connectorslug',
  }
})
const triggerId = trigger.data.id
```

Related [API reference](/cozy-stack/jobs/#triggers)

## Launch the trigger

```javascript
const resp = await triggerCollection.launch(trigger)
const jobId = resp.data.id
```

The job id will be used to follow the job execution

Related [API reference](/cozy-stack/jobs/#triggers)

## Follow job execution

If you need to know when the connector execution has ended, this information is available via
[cozy-realtime](/cozy-realtime/)


```javascript
const WebSocket = require('ws') // only in nodejs environment
global.WebSocket = WebSocket // only in nodejs environment
const { createClientInteractive } = require('cozy-client/dist/cli')
const Realtime = require('cozy-realtime').default

// client creation + account cration + trigger creation here

const realtime = new Realtime({ client })
realtime.subscribe('updated', 'io.cozy.jobs', jobId, (job) => {
  if (job.state === 'done') {
    console.log(`job ${jobId} has ended successfully` )
  } else if (job.state === 'errored') {
    console.log(`job ${jobId} has ended with the following error: ${job.error}` )
  }
})

If you do not have access to websocket, you can still use the [jobs api](/cozy-stack/jobs/#get-jobsjob-id) to poll the job state
