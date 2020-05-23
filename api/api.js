const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');
const various = require('./various');
const html_template = require('./html_template')


const get_url = html_template.get_url
const get_file = various.get_file

exports.user_info = helpers.express_async(async (req, res) => {
    res.json(await various.get_user_info(req.session.user))
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

exports.delete_user_file = helpers.express_async(async (req, res) => {
    const doc = await db.user_file(req.session.user, req.params.id)
    await various.delete_file(doc, { force: true })
    res.json({ ok: true })
})

exports.handle_upload = helpers.express_async(async (req, res) => {
    const user_info = await various.get_user_info(req.session.user)
    if (req.query.daykeep > user_info.max_daykeep) {
        throw "invalid daykeep";
    }
    const file_id = db.new_id()
    const file = get_file(file_id)
    const out = fs.createWriteStream(file)
    try {
        await helpers.promise_WriteStream_pipe(req, out)
        const size = (await helpers.fsP.stat(file)).size
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

exports.handle_download = helpers.express_async(async (req, res) => {
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
            various.log_download(req, doc, input.bytesRead);
        }
    } else {
        html_template.get__before_download(req.query, doc, res)
    }
})
