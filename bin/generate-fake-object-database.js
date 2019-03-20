#!/usr/bin/env node

// DEBUG=generator bin/generate-fake-object-database.js

const { ObjectDatabase, LoggedObject } = require('../lib/object-database')
const debug = require('debug')('generator')
const shortid = require('shortid')

const db = new ObjectDatabase()
class FakeUser extends LoggedObject {}
const users = db.ensure_collection('users', FakeUser)
users.enable_logging()

const adds = 10000
debug(`adding ${adds} users`)
for (let i = 0; i < adds; ++i) {
  users.create_object({
    username: shortid(),
    email: `${shortid()}@${shortid()}.com`,
    mobile: String(parseInt(Math.random() * 99999)),
    about_me: `I am a lovely
snowflake.`
  })
}

debug(`done writing ${adds} new users`)

users.oplog.end()
users.oplog.once('finish', process.exit)
