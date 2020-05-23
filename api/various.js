const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const helpers = require('./helpers');


const get_file = exports.get_file = (file_id) => conf.upload_dir + '/' + file_id

exports.get_user_info = async (user) => {
    if (!user) throw "need relog"
    let info = {
        quota: conf.user_default.quota,
        max_daykeep: conf.user_default.max_daykeep,
        files_summary_by_deleted: _.merge({ 
            false: { total_size: 0, count: 0 },
            true: { total_size: 0, count: 0 },
        }, await db.files_summary_by_deleted(user)),
    }
    info.remaining_quota = info.quota - info.files_summary_by_deleted.false.total_size
    return info
}

exports.log_download = async (req, doc, bytes) => {
    const log = { 
        doc: doc._id,
        bytes,
        timestamp: helpers.now(),
        ip: conf.request_to_ip(req),
        user_agent: req.headers['user-agent'],
    }
    await db.insert_download(log)
}

const delete_file = exports.delete_file = async (doc, opts) => {
    try {
        await helpers.fsP.unlink(get_file(doc._id))
        await db.set_deleted(doc)
    } catch (err) {
        if (err.code === 'ENOENT' && opts.force) {
            console.error("file already deleted? marking it deleted")
            await db.set_deleted(doc)
        } else {
            console.error("keeping file non deleted, hopefully the error will go away??", err)
        }
    }
}

exports.remove_expired = async function() {
    console.log("checking expired files to remove")
    for (const doc of (await db.files_to_delete())) {
        console.log("removing expired", doc)
        delete_file(doc, { force: true })
    }
}