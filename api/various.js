const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const helpers = require('./helpers');
const mail = require('./mail');


// from https://github.com/Abazhenov/express-async-handler
exports.express_async = (fn) => (
    (req, res, next) => (
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error(conf.request_to_ip(req), req.method, req.originalUrl, "ERROR:", err)
            // try to send the error if possible
            try { res.status(500).json({ ok: false, err: ""+err }) } catch (_) {}
        })
    )
)

const get_file = exports.get_file = (file_id) => conf.upload_dir + '/' + file_id

exports.get_user_info = async (user) => {
    if (!user) throw "need relog"
    const exemption = await db.get_exemption(user.eppn) || {}
    let info = {
        is_admin: exemption.admin,
        quota: exemption.quota && helpers.un_formatBytes(exemption.quota) || conf.user_default.quota,
        max_daykeep: exemption.max_daykeep || conf.user_default.max_daykeep,
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
    } catch (err) {
        if (err.code === 'ENOENT' && opts.force) {
            console.error("file already deleted? marking it deleted")
        } else {
            console.error("keeping file non deleted, hopefully the error will go away??", err)
            return
        }
    }
    if (doc.partial_uploader_file_id) {
        await db.delete_upload(doc)
    } else {
        await db.set_upload(doc, { deleted: true })
        if (doc.notify_on_delete) {
            await mail.notify_on_delete(doc, await db.file_downloads(doc._id))
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

exports.is_logged_user_admin = async (req) => {
    const exemption = await db.get_exemption(req.session.user.eppn)
    return (exemption || {}).admin
}
