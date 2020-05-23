const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');
const html_template = require('./html_template')

const get_url = html_template.get_url

const get_file = (file_id) => conf.upload_dir + '/' + file_id

const get_user_info = async (user) => {
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

exports.user_info = helpers.express_async(async (req, res) => {
    res.json(await get_user_info(req.session.user))
})

const add_downloadCount = async (docs) => {
    const id2count = await db.files_download_count(docs.map(doc => doc._id))
    docs.forEach(doc => doc.downloadCount = id2count[doc._id] || 0)
}
exports.user_files = helpers.express_async(async (req, res) => {
    let docs = await db.user_files(req.session.user, req.query.include_deleted === 'true')
    await add_downloadCount(docs)
    res.json(docs)
})

exports.user_file = helpers.express_async(async (req, res) => {
    const file = await db.user_file(req.session.user, req.params.id)
    file.downloads = await db.file_downloads(file._id)
    file.get_url = get_url(file._id)
    res.json(file)
})

exports.handle_upload = helpers.express_async(async (req, res) => {
    const user_info = await get_user_info(req.session.user)
    if (req.query.daykeep > user_info.max_daykeep) {
        throw "invalid daykeep";
    }
    const file_id = db.new_id()
    const file = get_file(file_id)
    const out = fs.createWriteStream(file)
    try {
        await helpers.promise_WriteStream_pipe(req, out)
        const size = (await helpers.fs_stat(file)).size
        if (size > user_info.remaining_quota) throw "quota dépassé, téléversement échoué"
        const doc = { 
            _id: file_id, 
            size, 
            ..._.pick(req.query, 'filename', 'type', 'download_ack', 'summary', 'password'),

            uploadTimestamp: helpers.now(),
            expireAt: helpers.addDays(helpers.now(), req.query.daykeep),
            deleted: false,
            
            uploader: req.session.user,
            ip: conf.request_to_ip(req),
            user_agent: req.headers['user-agent'],
        }
        await db.insert_upload(doc)
        mail.notify_on_upload(doc) // do not wait for it to return
        res.json({ ok: true, get_url: get_url(file_id) })    
    } catch (err) {
        fs.unlink(file, _ => {})
        res.status(500).json({ ok: false, err })
    }
})

const log_download = async (req, doc, bytes) => {
    const log = { 
        doc: doc._id,
        bytes,
        timestamp: helpers.now(),
        ip: conf.request_to_ip(req),
        user_agent: req.headers['user-agent'],
    }
    await db.insert_download(log)
}

exports.handle_download = helpers.express_async(async (req, res, next) => {
    const file_id = req.query.id
    if (!file_id) {
        throw "missing id parameter"
    }
    if (!file_id.match(/^\w{24}$/)) {
        throw "invalid id"
    }

    const doc = await db.get_upload(file_id)
    if (!doc) throw "unknown id"
    if (doc.password ? doc.password === req.query.password : req.query.auto) {
        const input = fs.createReadStream(get_file(file_id))
        try {
          await helpers.promise_ReadStream_pipe(input, () => {
            if (doc.download_ack) {
                mail.notify_on_download(req, doc) // do not wait for it to return
            }
            _.each({
                "Content-Type": doc.type,
                'Content-Disposition': "attachment; filename=" + doc.filename,
                'Content-transfert-encoding': "binary",
                'Content-Length': doc.size,
            }, (v, k) => { if (v) res.setHeader(k, v) })
            return res;
          })
        } finally {
            log_download(req, doc, input.bytesRead);
        }
    } else {
        html_template.get__before_download(req.query, doc, res)
    }
})

exports.remove_expired = async function() {
    console.log("checking expired files to remove")
    for (const doc of (await db.files_to_delete())) {
        console.log("removing expired", doc)
        try {
            await helpers.fs_unlink(get_file(doc._id))
            await db.set_deleted(doc)
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error("file already deleted? marking it deleted")
                await db.set_deleted(doc)
            } else {
                console.error("keeping file non deleted, hopefully the error will go away??", err)
            }
        }
    }
}
