const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');
const various = require('./various');
const antivirus = require('./antivirus');
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
    if (!file) throw "invalid id"
    file.downloads = await db.file_downloads(file._id)
    file.get_url = get_url(file._id)
    res.json(file)
})

exports.delete_user_file = helpers.express_async(async (req, res) => {
    const doc = await db.user_file(req.session.user, req.params.id)
    await various.delete_file(doc, { force: true })
    res.json({ ok: true })
})

exports.modify_user_file = helpers.express_async(async (req, res) => {
    const doc = await db.user_file(req.session.user, req.params.id)
    if (req.query.extend_lifetime) {
        const user_info = await various.get_user_info(req.session.user)
        await db.set_upload(doc, {
            expireAt: helpers.addDays(helpers.now(), user_info.max_daykeep),
        })
    } else {
        throw "unknown action"
    }
    res.json({ ok: true })
})

const _create_doc = async (req, params) => {
    await antivirus.may_check(various.get_file(params._id))

    const doc = { 
        ..._.pick(params, '_id', 'size', 'filename', 'type', 'notify_on_download', 'notify_on_delete', 'password', 'uploader'),

        uploadTimestamp: helpers.now(),
        expireAt: helpers.addDays(helpers.now(), params.daykeep || 1),
        deleted: false,
        
        ip: conf.request_to_ip(req),
        user_agent: req.headers['user-agent'],
    }
    await db.insert_upload(doc)
    return doc
}

const _body_to_file = async (req, file_id) => {
    const file = get_file(file_id)
    const out = fs.createWriteStream(file)
    try {
        await helpers.promise_WriteStream_pipe(req, out)
        const { size } = await helpers.fsP.stat(file)
        if (size === 0) throw "empty content";
        return size
    } catch (err) {
        fs.unlink(file, _ => {})
        throw err;
    }
}

const _upload_response = (req, res, doc, prefer_json) => {
    const accept = req.headers.accept || ''
    if (accept.match(/^application\/json/) ||
        prefer_json && !accept.match(/^text/)) {
        res.json({ ok: true, get_url: get_url(doc._id) })    
    } else {
        res.send(get_url(doc._id))
    }
}

exports.handle_upload = helpers.express_async(async (req, res) => {
    const user_info = await various.get_user_info(req.session.user)
    if (req.query.daykeep > user_info.max_daykeep) {
        throw "invalid daykeep";
    }
    const file_id = db.new_id()
    const size = await _body_to_file(req, file_id)
    if (size > user_info.remaining_quota) throw "quota dépassé, téléversement échoué"
    const doc = await _create_doc(req, { ...req.query, size, uploader: req.session.user, _id: file_id })
    mail.notify_on_upload(doc) // do not wait for it to return
    _upload_response(req, res, doc, true)
})

exports.handle_trusted_upload = helpers.express_async(async (req, res) => {
    const file_id = db.new_id()
    let params;
    if (/^multipart[/]form-data/i.test(req.headers['content-type'])) {
        const { fields, files } = await helpers.form_parse(req)
        if (!files.upload) throw "invalid form trusted upload: expected file named 'upload'";
        if (!fields.owner) throw "missing 'owner' parameter"

        const { path, name, type, size } = files.upload

        await helpers.fsP.copyFile(path, get_file(file_id));

        // cleanup
        _.each(files, file => helpers.fsP.unlink(file.path))

        params = { ...fields, filename: name, type, size }
        console.log(params)
    } else {
        if (!req.query.owner) throw "missing 'owner' parameter"
        if (!req.query.type) throw "missing 'type' parameter"
        const size = await _body_to_file(req, file_id)
        params = { ...req.query, size }
    }
    const uploader = { eppn: params.owner, mail: params.mail || params.owner }
    const doc = await _create_doc(req, { ...params, _id: file_id, uploader })
    console.log(doc)
    _upload_response(req, res, doc, false)
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
            if (doc.notify_on_download) {
                mail.notify_on_download(req, doc) // do not wait for it to return
            }
            _.each({
                "Content-Type": doc.type,
                ...(doc.filename ? { 'Content-Disposition': "attachment; filename=" + doc.filename } : {}),
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

exports.get_exemptions = helpers.express_async(async (req, res) => {
    res.json(await db.get_exemptions())
})
exports.set_exemption = helpers.express_async(async (req, res) => {
    const userid = req.params.userid
    if (!userid) throw "missing userid parameter"

    if (req.query.quota) helpers.un_formatBytes(req.query.quota) // check the format

    if (req.query.admin) req.query.admin = true
    if (req.query.max_daykeep) req.query.max_daykeep = parseInt(req.query.max_daykeep)
    
    await db.set_exemption(userid, { ...req.query, modifyTimestamp: new Date() });
    res.json({ ok: true })
})
exports.delete_exemption = helpers.express_async(async (req, res) => {
    const userid = req.params.userid
    if (!userid) throw "missing userid parameter"
    await db.delete_exemption(userid, req.query);
    res.json({ ok: true })
})