const shortid = require('shortid')
const _ = require('lodash')
const fs = require('fs')
const EventEmitter = require('events')
const JsonStreamReader = require('json-streaming-reader').JsonStreamReader
const debug = require('debug')('oplog-db')

class OplogDatabase {
  constructor (data_dir) {
    if (data_dir === undefined) {
      const candidate_data_dir = 'data'

      try {
        if (fs.statSync(candidate_data_dir).isDirectory()) {
          fs.accessSync(candidate_data_dir, fs.constants.R_OK | fs.constants.W_OK)
          data_dir = candidate_data_dir
        }
      } catch (err) {
        // nop
      }
    }

    try {
      if (fs.statSync(data_dir).isDirectory()) {
        fs.accessSync(data_dir, fs.constants.R_OK | fs.constants.W_OK)
      }
    } catch (err) {
      throw new Error(`invalid data dir ${data_dir}: ${err}`)
    }

    debug('created object database with data_dir', data_dir)

    this.data_dir = data_dir
    this.collections = new Map()
  }

  ensure_collection (name, cls) {
    let collection = this.collections.get(name)

    if (!collection) {
      debug('adding collection', name)

      collection = new OplogCollection(name, cls, this.data_dir)
      this.collections.set(name, collection)
    }

    return collection
  }

  collection (name) {
    return this.collections.get(name)
  }

  async load () {
    for (let collection of this.collections.values()) {
      await collection.load()
    }

    for (let collection of this.collections.values()) {
      collection.enable_logging()
    }

    return this
  }
}

// Objects in this collection must have an `id` property which is unique to the
// other objects in the collection.

class OplogCollection {
  constructor (name, cls, data_dir) {
    this.name = name
    this.cls = cls
    this.objects = new Map()

    this.oplog_path = `${data_dir}/${name}.oplog`
    this.oplog = null
  }

  add_object (object) {
    this.objects.set(object.id, object)
    this._log({ add: object.data, t: +new Date() })
    return object
  }

  create_object (data) {
    data.id = shortid()
    return this.add_object(new this.cls(data))
  }

  get_object (id) {
    return this.objects.get(id)
  }

  rm_object (object) {
    this.objects.delete(object.id)
    this._log({ rm: object.id, t: +new Date() })
  }

  _did_set (object, keypath, value) {
    this._log({ id: object.id, set: keypath, v: value, t: +new Date() })
  }

  _did_unset (object, keypath) {
    this._log({ id: object.id, unset: keypath, t: +new Date() })
  }

  enable_logging () {
    debug(`enabling logging for collection ${this.name}: ${this.oplog_path}`)
    this.oplog = fs.createWriteStream(this.oplog_path, { flags: 'a' })
  }

  _log (operation) {
    debug('logging', operation)
    this.oplog.write(JSON.stringify(operation) + '\n')
  }

  async load () {
    const cls = this.cls

    return new Promise((resolve, reject) => {
      const read_stream = fs.createReadStream(this.oplog_path, { encoding: 'utf8' })
      const json_stream = new JsonStreamReader()
      read_stream.pipe(json_stream)

      let n = 0

      const on_err = err => {
        read_stream.close()
        json_stream.close()
        reject(`invalid record on line ${n}: ${err}`)
      }

      json_stream.on('data', ({record}) => {
        ++n

        if (record.add) {
          this.objects.set(record.add.id, new cls(record.add, this))
        } else if (record.rm) {
          this.objects.delete(record.rm)
        } else if (record.set || record.unset) {
          const object = this.objects.get(record.id)

          if (!object) {
            on_err(`collection ${this.name}: object ${record.id} not found`)
            return
          }

          if (record.set) {
            if (object.set_at) object.set_at(record.set, record.v)
            else if (_.isPlainObject(object)) _.set(object, record.set, record.v)
          } else {
            if (object.unset_at) object.unset_at(record.unset)
            else if (_.isPlainObject(object)) _.unset(object, record.unset)
          }
        } else {
          on_err(`invalid operation on oplog line ${n}`)
        }
      })

      json_stream.on('error', on_err)

      json_stream.on('end', () => {
        debug(`end. ${n} records processed.`)
        resolve(this)
      })
    })
  }
}

// Convenience base class for persisted objects.
// This will notify its collection when it changes.

class OplogObject {
  constructor (data, collection) {
    this.data = data
    this.collection = collection
  }

  set_at (keypath, value) {
    _.set(this.data, keypath, value)
    this.collection._did_set(this, keypath, value)
  }

  unset_at (keypath, value) {
    _.unset(this.data, keypath)
    this.collection._did_unset(this, keypath, value)
  }

  destroy () {
    this.collection.rm_object(this)
  }

  get json () {
    return JSON.stringify(this.data)
  }
}

module.exports = {
  Database: OplogDatabase,
  Collection: OplogCollection,
  Object: OplogObject
}
