const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');
const various = require('./various');
const antivirus = require('./antivirus');
const html_template = require('./html_template')


const express_async = various.express_async
const get_url = html_template.get_url
const get_file = various.get_file

exports.user_info = express_async(async (req, res) => {
    res.json(await various.get_user_info(req.session.user))
})

const add_downloadCount = async (docs) => {
    const id2count = await db.files_download_count(docs.map(doc => doc._id))
    docs.forEach(doc => doc.downloadCount = id2count[doc._id] || 0)
}
exports.user_files = express_async(async (req, res) => {
    let docs = await db.user_files(req.session.user, req.query.include_deleted === 'true')
    await add_downloadCount(docs)
    res.json(docs)
})

exports.user_file = express_async(async (req, res) => {
    const file = await db.user_file(req.session.user, req.params.id)
    if (!file) throw "invalid id"
    file.downloads = await db.file_downloads(file._id)
    file.get_url = get_url(file._id)
    res.json(file)
})

exports.delete_user_file = express_async(async (req, res) => {
    const doc = await db.user_file(req.session.user, req.params.id)
    await various.delete_file(doc, { force: true })
    res.json({ ok: true })
})

exports.modify_user_file = express_async(async (req, res) => {
    const doc = await db.user_file(req.session.user, req.params.id)
    let subdoc = {}
    for (const attr of ['notify_on_download', 'notify_on_delete', 'hide_uploader', 'password']) {
        if (attr in req.query) {
            const val = req.query[attr]
            subdoc[attr] = attr === 'password' ? val : !!val
        }
    }
    if (req.query.extend_lifetime) {
        const user_info = await various.get_user_info(req.session.user)
        subdoc.expireAt = helpers.addDays(helpers.now(), user_info.max_daykeep)
    }
    if (_.isEmpty(subdoc)) {
        throw "nothing to do"
    }
    await db.set_upload(doc, subdoc)
    res.json({ ok: true })
})

const _save_doc = async (req, params, partial_upload) => {
    if (!partial_upload) {
        await antivirus.may_check(various.get_file(params._id))
    }

    let doc = { 
        ..._.pick(params, '_id', 'size', 'filename', 'type', 'notify_on_download', 'notify_on_delete', 'hide_uploader', 'password', 'uploader'),

        uploadTimestamp: helpers.now(),
        expireAt: helpers.addDays(helpers.now(), partial_upload ? 1 : params.daykeep || 1),
        deleted: false,
        
        ip: conf.request_to_ip(req),
        user_agent: req.headers['user-agent'],
    }
    if (partial_upload) {
        doc.partial_uploader_file_id = params.id
    }
    await db.set_upload(doc)
    return doc
}

const _save_partial_upload = async (req, file_id) => {
    try {
        await _save_doc(req, { ...req.query, uploader: req.session && req.session.user, _id: file_id }, true)
    } catch (err_) {
        console.error(err_)
    }
}

const _keep_user_session_live = (req) => (
    req.session && setInterval(_ => {
        console.log("keeping_user_session_live", req.session)
        req.session.save(_ => {})
    }, conf.session_store.ttl / 2 * 1000)
)

const _body_to_file = async (req, file_id, save_partial_upload) => {
    const file = get_file(file_id)
    await _save_partial_upload(req, file_id) // in case process is stopped, ensure aborted uploads can be removed
    const out = fs.createWriteStream(file, { flags: 'a' })
    let keeping_user_session_live
    try {
        if (save_partial_upload) keeping_user_session_live = _keep_user_session_live(req)
        await helpers.promise_WriteStream_pipe(req, out)
        const { size } = await helpers.fsP.stat(file)
        if (size === 0) throw "empty content";
        return size
    } catch (err) {
        if (save_partial_upload) {
            await _save_partial_upload(req, file_id)
        } else {
            fs.unlink(file, _ => {})
        }
        throw err;
    } finally {
        if (keeping_user_session_live) clearInterval(keeping_user_session_live)
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

const throw_ = (err) => { throw err }

const _get_partial_upload = async (req) => (
    await db.get_upload_({ uploader: req.session.user, partial_uploader_file_id: req.query.id }) ||
        throw_("partial_upload_impossible")
)

exports.get_partial_upload_size = express_async(async (req, res) => {
    const doc = await _get_partial_upload(req)
    const { size } = await helpers.fsP.stat(get_file(doc._id))
    res.json({ ok: true, size })
})

const _prepare_partial_upload = async (req) => {
    const doc = await _get_partial_upload(req)
    const { size } = await helpers.fsP.stat(get_file(doc._id))
    if (size != req.query.bytes_start) {
        throw "partial_upload_impossible"
    }
    console.log("partial upload at", size)
    // we are starting partial upload. give it some time to succeed
    db.set_upload(doc, { expireAt: helpers.addDays(helpers.now(), 1)})
    return doc._id
}

exports.handle_upload = express_async(async (req, res) => {
    const user_info = await various.get_user_info(req.session.user)
    if (req.query.daykeep > user_info.max_daykeep) {
        throw "invalid daykeep";
    }
    const file_id = req.query.bytes_start ? await _prepare_partial_upload(req) : db.new_id()
    const size = await _body_to_file(req, file_id, true)
    if (size > user_info.remaining_quota) throw "quota dépassé, téléversement échoué"
    const doc = await _save_doc(req, { ...req.query, size, uploader: req.session.user, _id: file_id })
    mail.notify_on_upload(doc) // do not wait for it to return
    _upload_response(req, res, doc, true)
})

exports.handle_trusted_upload = express_async(async (req, res) => {
    const file_id = db.new_id()
    let params;
    if (/^multipart[/]form-data/i.test(req.headers['content-type'])) {
        const { fields, files } = await helpers.form_parse(req, undefined, ['upload'])
        if (!files.upload) throw "invalid form trusted upload: expected file named 'upload'";
        if (!fields.owner) throw "missing 'owner' parameter"

        const { filepath, originalFilename, mimetype, size } = files.upload

        await helpers.fsP.copyFile(filepath, get_file(file_id));

        // cleanup
        _.each(files, file => helpers.fsP.unlink(file.filepath))

        params = { ...fields, filename: originalFilename, type: mimetype, size }
        console.log(params)
    } else {
        if (!req.query.owner) throw "missing 'owner' parameter"
        if (!req.query.type) throw "missing 'type' parameter"
        const size = await _body_to_file(req, file_id)
        params = { ...req.query, size }
    }
    const uploader = { eppn: params.owner, mail: params.mail || params.owner }
    const doc = await _save_doc(req, { ...params, _id: file_id, uploader })
    console.log(doc)
    _upload_response(req, res, doc, false)
})

exports.handle_download = express_async(async (req, res) => {
    const file_id = req.query.id
    if (!file_id) {
        throw "missing id parameter"
    }
    if (!file_id.match(/^\w{24}$/)) {
        throw "invalid id"
    }

    const doc = await db.get_upload(file_id)
    if (!doc) throw "unknown id"

    if (doc.deleted) {
        res.set('Content-Type', 'text/html');
        res.end(`Le fichier que vous avez demandé n'est plus disponible au téléchargement`)
        return
    }

    if (doc.password ? doc.password === req.query.password : req.query.auto) {
        const input = fs.createReadStream(get_file(file_id))
        try {
          await helpers.promise_ReadStream_pipe(input, () => {
            if (doc.notify_on_download) {
                mail.notify_on_download(req, doc) // do not wait for it to return
            }
            _.each({
                "Content-Type": doc.type,
                ...(doc.filename ? { 
                    'Content-Disposition': `attachment; filename="${
                        _.deburr(doc.filename).replace(/[^\w-]/g, '-')
                    }"; filename*=UTF-8''${
                        encodeURIComponent(doc.filename)
                    }` } : {}
                ),
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

exports.get_exemptions = express_async(async (req, res) => {
    res.json(await db.get_exemptions())
})
exports.set_exemption = express_async(async (req, res) => {
    const userid = req.params.userid
    if (!userid) throw "missing userid parameter"

    if (req.query.quota) helpers.un_formatBytes(req.query.quota) // check the format

    if (req.query.admin) req.query.admin = true
    if (req.query.max_daykeep) req.query.max_daykeep = parseInt(req.query.max_daykeep)
    
    await db.set_exemption(userid, { ...req.query, modifyTimestamp: new Date() });
    res.json({ ok: true })
})
exports.delete_exemption = express_async(async (req, res) => {
    const userid = req.params.userid
    if (!userid) throw "missing userid parameter"
    await db.delete_exemption(userid, req.query);
    res.json({ ok: true })
})