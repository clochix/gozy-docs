---
title: How to write a connector
summary: And import data from a service to your Cozy
---

## Introduction

A connector (also known as _konnector_) is a script that imports data from another web service and put those data into your cozy.
Each connector is an independent application, managed by the [Cozy Home] application.

To protect your data, each connector runs inside a container in order to sandbox all their interactions with your data.

> ⚠️ For historical reasons, in the Cozy codebase, a cozy connector is named konnector, please follow this convention if modifying an existing application.


## How does it work?

A connector is a NodeJS script.
The target node version used to run your connector is the version 8.

Like client side apps, connectors communicate with the [Cozy Stack](https://docs.cozy.io/en/cozy-stack/README/) using its HTTP API, and get a unique auth token every time they start.
They need to register with a manifest, and ask the user for permissions.

To facilitate connector development, a npm package, [cozy-konnector-libs](https://github.com/konnectors/libs), provides some shared libraries that are adapted to be used for a connector:

 - [cheerio](https://cheerio.js.org) to easily query a HTML page
 - [request-promise](https://github.com/request/request-promise): [request](https://github.com/request/request) with Promise support
 - [request-debug](https://github.com/request/request-debug) that displays all the requests and responses in the standard output.
   Toggle _debug_ option in [requestFactory options](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_requestFactory)

Besides, you'll probably need some other npm packages to help you run your connector:

 - [momentjs](http://momentjs.com/docs/) or [date-fns](https://date-fns.org) to manage dates
 - [bluebird](http://bluebirdjs.com) to get enhanced promises

When the connector is started, it also receives some data via environment variables:

 - `COZY_CREDENTIALS`: an auth token used by [cozy-client-js] to communicate with the server
 - `COZY_URL`: the Cozy Stack API entry point
 - `COZY_FIELDS`: settings coming from [Cozy Home] and filled by the user (login, password, directory path).

These variables are used by the connector and the cozy-client to configure the connection to the [Cozy Stack] with the right permissions as defined in the connector manifest.
They are simulated in standalone mode so that you do not need a real Cozy Stack to develop a connector.
[[More about BaseKonnector](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#basekonnector)]

From the server point of view, each connector is a `job` which is executed periodically via a `trigger`.
[[More about Cozy Stack jobs](https://docs.cozy.io/en/cozy-stack/jobs/)]

## Let’s create our first connector

The easiest way to create a new connector is to use [cozy-konnector-template](https://github.com/konnectors/cozy-konnector-template):

ℹ There is also a [(french) youtube video to create your first connector](https://www.youtube.com/watch?v=gp0cE8kHEBc&list=PLBgB0F1WGyOXMqKZe-Q1ql0Fz-ohPkq6-)

### Run the sample

First of all, [download](https://github.com/konnectors/cozy-konnector-template/archive/master.zip) or clone the repository:

```sh
git clone https://github.com/konnectors/cozy-konnector-template cozy-konnector-newservice
cd cozy-konnector-newservice
rm -rf .git
git init
yarn install # or npm install
```
_note: we use `yarn`, but if you prefer `npm`, keep using it, everything should work._

The connector is ready to run with sample code.
As a demo we will scrape a fictional website: [books.toscrape.com](http://books.toscrape.com), for which __you do not need credentials__.

As indicated in the `README.md` file, just run:

```sh
yarn standalone # or npm run standalone
```
The very first run will create a `konnector-dev-config.json` file that allows you to configure the connector input when executing it with the CLI.
This configuration comes from [Cozy Collect] when deployed.

```json
{
  "COZY_URL": "http://cozy.tools:8080",
  "fields": {
    // configuration injected to the start function
  }
}
```

The `fields` property allows you to set credentials for the targeted web service, such as `login` and `password` as if they come from [Cozy Stack] (so from a real Cozy Cloud instance). You can add as many fields as the targeted service needs.
The `COZY_URL` property will be used later. You do not need to change it for now.

As explained earlier, the demo website [books.toscrape.com](http://books.toscrape.com) does not need any credentials.
But for the code to run without error, you need to register a _fake_ login and a _fake_ password:

```json
{
  "COZY_URL": "http://cozy.tools:8080",
  "fields": {
    "login": "zuck.m@rk.fb",
    "password": "123456"
  }
}
```

**In the template, this configuration file is already added to `.gitignore` file to be sure your credentials stay private.**

Now you can run the connector again in *standalone* mode to see how jpg and related data are downloaded.
In this mode, [`cozy-client-js`] is stubbed and all data meant to be saved in a cozy are displayed in the standard output and files are saved in the ./data directory of the connector.
This is useful to start developing your connector without handling the state of a real [Cozy Stack].

Please check [CLI section of the documentation](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/cli.md) for more information.

### Implement your connector

There are four steps for a connector to save data to [Cozy Stack]:

1. authentication
1. request data
1. parse and format data
1. save data to cozy stack

You can see these steps in the `src/index.js` in the [konnectors/template](https://github.com/konnectors/template/blob/master/src/index.js):

```javascript
async function start(fields) {
  // step 1.
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  // step 2.
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  const $ = await request(`${baseUrl}/index.html`)

  // step 3.
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  // step 4.
  // here we use the saveBills function even if what we fetch are not bills, but this is the most
  // common case in connectors
  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    // this is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case sensitive.
    identifiers: ['books']
  })
}
```

#### Authentication

Open the `src/index.js` file, there are comments to guide you through it.
The very first step is to be able to authenticate to the remote service, this is done with the line:

_note: don't forget to add your additional fields if you have some._

```js
await authenticate(fields.login, fields.password)
```

There are many obstacles at this level:

- is there a captcha?
- is there a 2FA?
- how is the `<form>`?

_note: if the remote service exposes an API, you should use classical [request](https://github.com/request/request-promise) call._

Let's say the remote service exposes a simple classical form like https://www.trainline.eu/signin:

```html
<form id="signin-form" novalidate="" class="signin__form" data-ember-action="" data-ember-action-680="680">

  <input name="email" autocomplete="on" placeholder="Email Address" id="ember691" class="ember-text-field textfield ember-view"
    data-enpass.usermodified="yes" type="email">

  <input name="password" autocomplete="on" placeholder="Password" id="ember696" class="ember-text-field textfield ember-view"
    data-enpass.usermodified="yes" type="password">

  <div class="signin__forgot">
    <span data-ember-action="" data-ember-action-697="697">
      <a href="/password" id="ember698" class="ember-view"> Forgot your password?
      </a>
    </span>
  </div>

  <div class="signin__buttons ">

    <div class="signin__buttons-block">
      <button type="submit" class="signin__button">
        Sign In
      </button>
    </div>
  </div>

</form>
```

Find a CSS selector for the form tag: `form#signin-form`.
Find the **name** of the input tags used to host user's credentials: `email` and `password`.

You are ready to complete the `signin(options)` object called in the `authenticate(username, password)` function:

```js
function authenticate(username, password) {
  return signin({
    url: `https://www.trainline.eu/signin`,
    formSelector: 'form#signin-form',
    formData: { email: username, password }, // "email" and "password" correspond to the name attribut of the HTML inputs
    validate: (statusCode, $) => {
      // write some code to validate the form submission
    }
  })
}
```

To implement the `validate` function, you need to check what is happening on a successful login and on an unsuccessful login.
With the https://www.trainline.eu/signin example, fill the form with wrong credentials, open your browser's devtools (and check the network tab) and submit the form.
Here it is clear, on incorrect credentials, the response have a status code `422`:

```http
HTTP/2.0 422 No Reason Phrase
```

Do the same with valid credentials.

```http
HTTP/2.0 200 OK
```

Then you can write a simple and straight forward `validate` code:

```js
function authenticate(username, password) {
  return signin({
    url: `https://www.trainline.eu/signin`,
    formSelector: 'form#signin-form',
    formData: { email: username, password },
    validate: (statusCode, $) => {
      return statusCode === 200 || log('error', 'Invalid credentials')
    }
  })
}
```

However if the target website doesn't use `statusCode` correctly you can also use `fullResponse.request.uri.href` to check if there is a redirection to a page that requires to be logged in :

```js
validate: (statusCode, $, fullResponse) => {
  return fullResponse.request.uri.href == 'https://example.com/account' || log('error', 'Invalid credentials')
}
```

It is also possible to use Cheerio to check if an HTML element is present in the web page or not :

```js
validate: (statusCode, $) => {
  return $('a[href="https://example.com/logout"]').length == 1 || log('error', $('.error').text())
}
```

#### Request data

Once the connector is able to be authenticated by the online service, the next step is to fetch data.
The most common case is that the invoices we want to fetch are listed in a HTML page.
So to request data, we fetch the target webpage that contains invoices list.

But sometimes, the webpage is a JavaScript page that uses a JSON API URL.
JSON is easier to parse than full HTML webpages.

For the purpose of this guide, let's consider we are in the case of a full HTML webpage, like the service given as an example in the template: http://books.toscrape.com

This is the easiest part, just fetch the webpage:

```js
const $ = await request('http://books.toscrape.com/index.html')
```

The `$` variable is set to a [cheerio](https://cheerio.js.org/) object with [useful API to crawl the webpage](https://github.com/request/request-promise#crawl-a-webpage-better).

ℹ You can name this variable as you want and create as many as you want Cheerio variables such as : `$doc` or `$page`.

That object will be very useful for the next step.

#### Parse the document

We want to get every `<article />` of the page in a JavaScript Array:

```js
const articles = [].map.call($('article', node => node))
```

For every book, we want to catch the title attribute of this tag `article h3 a`.
This is a [CSS Selector](https://developer.mozilla.org/en-US/docs/Web/API/Document_object_model/Locating_DOM_elements_using_selectors) that [cheerio](https://cheerio.js.org/) understands to select some part of the tree.
In order to crawl a list of items to create an Array of JSON object, we can create our own function or use the function [scrape from the connector libs](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape):

```js
const docs = scrape(
  $,
  {
    title: {
      sel: 'h3 a',
      attr: 'title'
    },
    amount: {
      sel: '.price_color',
      parse: normalizePrice
    },
    url: {
      sel: 'h3 a',
      attr: 'href',
      parse: url => `${baseUrl}/${url}`
    },
    fileurl: {
      sel: 'img',
      attr: 'src',
      parse: src => `${baseUrl}/${src}`
    },
    filename: {
      sel: 'h3 a',
      attr: 'title',
      parse: title => `${title}.jpg`
    }
  },
  'article'
)
```

>Keep in mind that there are many useful CSS [Pseudo-classes](https://developer.mozilla.org/en-US/docs/Learn/CSS/Introduction_to_CSS/Pseudo-classes_and_pseudo-elements) and [Combinators](https://developer.mozilla.org/en-US/docs/Learn/CSS/Introduction_to_CSS/Combinators_and_multiple_selectors)  that you can use in your CSS selectors to help you select HTML elements.

This code will loop on `<article />` and for each item will create a JSON object with the selector `sel` and the value of attribute `attr` if specified, otherwise it takes the value of the child node, this value can be edited with the `parse` function.
Here is a sample for the following markup from http://books.toscrape.com:

```html
<article class="product_pod">
  <div class="image_container">
    <a href="catalogue/a-light-in-the-attic_1000/index.html">
      <img src="media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg" alt="A Light in the Attic" class="thumbnail">
    </a>
  </div>
  <p class="star-rating Three">
    <i class="icon-star"></i>
    <i class="icon-star"></i>
    <i class="icon-star"></i>
    <i class="icon-star"></i>
    <i class="icon-star"></i>
  </p>
  <h3>
    <a href="catalogue/a-light-in-the-attic_1000/index.html" title="A Light in the Attic">A Light in the ...</a>
  </h3>
  <div class="product_price">
    <p class="price_color">£51.77</p>
    <p class="instock availability">
      <i class="icon-ok"></i>
      In stock
    </p>
    <form>
      <button type="submit" class="btn btn-primary btn-block" data-loading-text="Adding...">Add to basket</button>
    </form>
  </div>
</article>
```

And we will get the following JSON object:

```json
{
  "title": "A Light in the Attic",
  "amount": 51.77,
  "url": "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "fileurl": "http://books.toscrape.com/media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg",
  "filename": "A Light in the Attic.jpg"
}
```

`fileurl` is used to tell Cozy where to find the file (here an image) to retreive. Then you can save it to Cozy Stack (see section below).

There are many [document types](https://github.com/cozy/cozy-doctypes) (Doctypes) you can store in your Cozy, such as :
- [Bills](https://github.com/cozy/cozy-doctypes/blob/master/docs/io.cozy.bills.md)
- [Contacts](https://github.com/cozy/cozy-doctypes/blob/master/docs/io.cozy.contacts.md)
- [Bank](https://github.com/cozy/cozy-doctypes/blob/master/docs/io.cozy.bank.md)
- and so on…

The code sample includes some other function to manipulate the result object, but we have the idea.
Once we build a correct object, we can save it to Cozy Stack.

#### Save data to Cozy Stack

In the example we use some built-in function to save a bill to the Cozy Stack.
But there is a bunch of functions available depending on what you want:

- [`addData`](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#adddata)
- [`hydrateAndFilter`](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_hydrateAndFilter)
- [`saveBills`](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_saveBills) to save invoices files (this function use `saveFiles`) that can be linked to your bank transactions.
- [`saveFiles`](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_saveFiles) to upload files to Cozy Drive.
- and so on…

For example, to save bills to Cozy you have to start by recovering all required fields for a data type [io.cozy.bills](https://github.com/cozy/cozy-doctypes/blob/master/docs/io.cozy.bills.md) using the `scrape` function, and then you can use the function `saveBills` to save your docs to Cozy Stack as shown below:

```js
await saveBills(documents, fields, {
  idenditifiers: ['vendor'], // name of the target website
  contentType: 'application/pdf'
})
```

*`documents` is the list of bills returned by the function `parseDocuments` after the page scraping*.

We can find more information in the [libs repository](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md).

__Now that we pass on every steps, it is time to test the connector with `yarn standalone`.__
We will see next how to connect it effectively to a Cozy Stack.


---


## Going further

### Connector structure

Basically, a connector is just a function passed to the `BaseKonnector` constructor, and which
eventually returns a promise:

To create the connector, just create a new instance of `BaseKonnector` with a function as argument:

```js
const {BaseKonnector} = require('cozy-konnector-libs')

module.exports = new BaseKonnector(fields => {
  // use fields to get user credentials and choices
  console.log(fields, 'fields')
})
```

#### Typical workflow

Everytime the connector is run, it will call the function and wait for the resolution of the returned promise.
This function can then:

- log into the target website,
- fetch data,
- and save them as an array of objects with specific attributes expected by the save function (`saveFiles`, `addData`, `hydrateAndFilter`, `saveBills`).

A basic connector workflow involves:

 1. authenticate on the website or API. Might be tricky, but that's the fun :-)
 2. getting data from the online service. You can get the data by calling an API or scraping the webpage. Check if the webpage itself is not using an API to retrieve data, might speed up our job. Mobile phones applications usually connects to an API that might be a reliable source of data.
 </br>A quick [exemple of a scraper here](#How-do-I-scrape-my-data-from-a-website).
 3. filtering data to remove the ones already present inside the database using [hydrateAndFilter](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_hydrateAndFilter)
 4. save the filtered data into the database ([addData](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#adddata))
 5. save the related files using ([saveFiles](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savefiles))

#### Error handling

If your connector hits an issue fetching or saving the data, it can return an error code by throwing it as an error. The error codes are defined inside the [Cozy Collect] application and will display an explicit error to the user:

  - `LOGIN_FAILED`: the connector could not login
  - `NOT_EXISTING_DIRECTORY`: the folder specified as folder_to_save does not exist (checked automatically by the BaseKonnector)
  - `UNKNOWN_ERROR`: there was an unexpected error, please take a look at the logs to know what happened
  - `VENDOR_DOWN`: the target web site is down now
  - `USER_ACTION_NEEDED`: The user needs to login to the service to do manual actions (could be Terms Of Service to validate)

You can get the list of error codes in `require('cozy-konnector-libs').errors` ([source](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/src/helpers/errors.js))

```js
const {BaseKonnector, errors} = require('cozy-konnector-libs')

module.exports = new BaseKonnector(fields => {
    // Here, the following message will be displayed in cozy-collect : "Bad credentials. Check the konnector fields and run the connection again."
    throw new Error(errors.LOGIN_FAILED)
})
```

#### [cozy-konnector-libs]

The Cozy Konnector Libs provide several useful methods for common tasks:

 - [BaseKonnector](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#basekonnector): creates the connector and fetches from the stack the connector's parameters (COZY_FIELDS...)
 - [cozyClient](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#cozyclient) gives an instance of [cozy-client-js] already initialized according to `COZY_URL`, and `COZY_CREDENTIALS`. Your code can immediately interact with the server thanks to this client.
 - [requestFactory](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_requestFactory) a function which returns an instance of request-promise initialized with defaults often used in connector development.
 - [log](https://github.com/cozy/cozy-konnector-libs/blob/3cad316bac1898ef3c2656577af786f6549b40b0/packages/cozy-logger/src/index.js#L35-L41) allows to log messages with different levels
 - [hydrateAndFilter](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#hydrateAndFilter) to filter data
 - [addData](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#adddata) to store the retrieved data into the cozy
 - [linkBankOperations](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#linkbankoperations) to link a bill to a bank operation
 - [saveBills](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills) which uses hydrateAndFilter, addData, saveFiles and linkBankOperations and which is specific to bills
 - [updateOrCreate](https://github.com/cozy/cozy-konnector-libs/blob/master/packages/cozy-konnector-libs/docs/api.md#updateorcreate) create or update documents inside database
  - [htmlToPDF]() to convert HTML code to PDF content to insert into a PDF file created with the `createCozyPDFDocument` function
 - [createCozyPDFDocument]() to create a new PDF file to pass to `htmlToPDF`

## Linking your connector to a cozy : `dev mode`

After several `yarn standalone`, your connector is able to automaticaly gather data from the targeted web service. </br>It's time now to put this data in a real cozy. </br>Here comes the *dev mode*.

For that your connector needs more setup :
* a `manifest.konnector` file
* a `COZY_URL` section in `konnector-dev-config.json`

### The manifest

Each connector is described by a manifest. This is a JSON file named `manifest.konnector` at the root of your code folder. It should include the following minimal information:

```json
{
  "name": "konnector name",
  "type": "node",
  "slug": "konnectorslug",
  "description": "description",
  "source": "git://github.com/cozy/cozy-konnector-thename.git",
  "permissions": {
    "accounts": {
      "description": "Required to get the account's data",
      "type": "io.cozy.accounts",
      "verbs": ["GET"]
    }
  }
}
```

[cozy-konnector-template] already has a manifest which you can customize.

You may add some permissions for your own doctype. [Here](https://docs.cozy.io/en/cozy-stack/konnectors/#the-manifest) is the detailed list of fields for a
connector manifest file.

You can also get more information on permissions in the official [cozy-stack documentation](https://github.com/cozy/cozy-stack/blob/master/docs/permissions.md)

### konnector-dev-config.json

If you want to put data from your connector to a real cozy, your must define where to find this
cozy, and this must be a cozy for which you have the credentials.

Here comes the `COZY_URL` in konnector-dev-config.json which defines just that.

### Run the dev mode

Then you just have to run:

```sh
yarn dev
```

For the first run, the CLI will open a tab in your browser asking you to grant permissions to the
connector. The connector will then save data directly into your cozy. This will validate that your
manifest has the needed permissions on the data you want to save.

This is the *dev* mode.

## Integration in the store for all the users

To run a connector, we do not want the cozy to install all dependencies of the connector each time
it installs it.

To avoid this, the connectors need to be compiled into one file in a dedicated branch of the
repository and the repository needs to be a public git repository. The `package.json` file
from [cozy-konnector-template] gives you the commands to do this : `yarn build` and `yarn deploy`
but the last one needs to be configured in `package.json`

Once your public git repository is configured, you only have to declare it.

Cozy will soon have a store for connectors and you will be able to publish connectors yourself. But
at the moment, you need to declare your new connector on the [cozy forum](https://forum.cozy.io).
The Cozy team will review your code and add your connector to the [Cozy Collect] application.

To make the connector available more quickly for all cozys, you can follow this few steps of
packaging:

### Icon

You need to push an icon in `assets/`. Please respect this rules :

 - Square icon, possibly a png or svg
 - Try the Apple app store icon if needed

### Package.json

 - Edit the name to be cozy-konnector-<slug\>
 - Edit the repository URL
 - Edit the command `deploy` with the correct repository URL

### Manifest.konnector

 - Edit the name with a nice name (Capitals and spaces allowed here)
 - Edit icon as needed
 - Edit slug (no capitals and no spaces here)
 - Edit source with the correct repository URL
 - Add a correct vendor link
 - Choose one or more categories (used to sort connectors in Cozy Store)  in this list : `banking, shopping, insurance, isp, telecom, energy, public_service, other`.
 - If needed, change the input type the target website use to login the user: `text`, `email` or `phone` for instance, this will enforce pre-checking
 - Edit for both locales `en` and `fr` the short description and long description

## FAQ

### When I run my connector, a ghost node process eats all my memory

Cozy-konnector-libs uses [cheerio](https://cheerio.js.org) which is great but causes some problems
when you try to console.log a cheerio object.

In standalone or dev mode, the BaseKonnector tries to catch errors and display a maximum of details
about them. But when the error contains a cheerio object, the problem happens.

If you get this problem, catch the error yourself and only display the message :

```javascript
.catch(err) {
  console.log(err.message) // good
  console.log(err) // bad
}
```

### How do I scrap a website

Use the request function from [cozy-konnector-libs] with the proper options.

Here’s a sample code that will fetch the login page to get the value of the anti-CSRF token, submit the login form, browse to the bills page and fetch a bill:

```javascript
const {BaseKonnector, requestFactory} = require('cozy-konnector-libs')
const rq = requestFactory({
  jar: true, // handle the cookies like a browser
  json: false, // do not try to parse the result as a json document
  cheerio: true // automatically parse the result with [cheerio](https://github.com/cheeriojs/cheerio)
})
const moment = require('moment')

module.exports = new BaseKonnector(function fetch (fields) {
  return rq("https://login.remote.web")
  .then($ => { // the result is automatically wrapped with cheerio and you can use it like jQuery
    const form = {
      form: {
        login: fields.login,
        password: fields.password,
        csrf_token: $('[name="csrf_token"]').val(),
      }
    }
    return rq({
      method: 'POST',
      form
    })
  })
  .then($ => rq("https://admin.remote.web/bills"))
  .then($ => {
    return [{date: moment($("#bill_date")), value: $("#bill_value")}]
  })
  .then(entries => addData(entries, 'io.cozy.bills'))
})
```

### What does the `yarn deploy` command do ?

This will deploy a compiled version of your connector in a dedicated branch of your git repository
using [git-directory-deploy](https://github.com/lukekarrys/git-directory-deploy).
This deployed version can then be referenced to
[cozy-app-publish](https://github.com/cozy/cozy-libs/tree/master/packages/cozy-app-publish) to deploy your
connector to the registry.

### I want to pass secret variables to my connector without hardcoding it in the source code

**COZY_PARAMETERS** environment variable will help you.

In standalone mode or dev mode, you can init it in konnector-dev-config.json :

```json
  "COZY_PARAMETERS": {
    "secret": {
      "mySecretKey": "s3cr3tk3y"
    }
  }
```

In your connector, you will get these secrets as a second parameter in your main function.

```js
module.exports = new BaseKonnector(start)

async function start(fields, cozyParameters) {
  log('info', cozyParameters.secret.mySecretKey)
}
// -> "s3cr3tk3y"
```

If you want to know how this works in a real cozy, you can find more information on [Stack documentation](https://docs.cozy.io/en/cozy-stack/konnectors-workflow/#secrets-that-are-not-oauth)

[Cozy Home]: https://github.com/cozy/cozy-home
[Cozy Stack]: https://docs.cozy.io/en/cozy-stack/README/
[cozy-konnector-libs]: https://github.com/cozy/cozy-konnector-libs
[cozy-client-js]: https://github.com/cozy/cozy-client-js/
[cozy-konnector-template]: https://github.com/cozy/cozy-konnector-template
