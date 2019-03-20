#!/usr/bin/env node

// DEBUG=generator bin/generate-users-collection.js

const db = require('..')
const debug = require('debug')('generator')
const shortid = require('shortid')

const database = new db.Database()
class FakeUser extends db.Object{}
const users = database.ensure_collection('users', FakeUser)
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
