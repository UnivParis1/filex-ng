const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');

const get_url = (file_id) => `https://${conf.our_vhost}/get?id=${file_id}`

const get_file = (file_id) => conf.upload_dir + '/' + file_id

const get_user_info = async (user) => {
    if (!user) throw "need relog"
    let info = {
        quota: conf.user_default.quota,
        max_daykeep: conf.user_default.max_daykeep,
        files_summary_by_deleted: await db.files_summary_by_deleted(user),
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
        res.set('Content-Type', 'text/html');

        res.end(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ` + (doc.password ? '' :
        `<meta http-equiv="refresh" content="5; URL=${get_url(file_id)}&auto=1">`
    ) + `
        <title>FileX</title>
        <link href="lib.css" type="text/css" rel="stylesheet">
        <link href="filex.css" type="text/css" rel="stylesheet">
    </head>
    <body>
    <script> 
        window.prolongation_ENT_args = { current: "CFilex", layout_url: "/EsupUserApps/layout" }; 
        window.bandeau_anonyme = {};
    </script>
    <script src="https://ent.univ-paris1.fr/assets/bandeau-anonyme/loader.js"></script>
    <script src="https://ent.univ-paris1.fr/ProlongationENT/loader.js"></script>
    <div id=bandeau-anonyme-title>Envoi de fichiers avec Filex</div>
    <div id="main">
        <p>Vous avez demandé le fichier <b>${doc.filename}</b></p>
        <p><b><i>Informations :</i></b></p>
            <ul>
            <li><b>Taille</b> : ${doc.size} Octets</li>
            <li><b>Publié le</b> : ${doc.uploadTimestamp.toLocaleString()}</li>
            <li><b>Disponible jusqu'au</b> : ${doc.expireAt.toLocaleString()}</li>
            <li><b>Publié par</b> : ${doc.uploader.mail}</li>
        </ul>
        
    ` + (doc.password ? 
    `<form>
    <p>
        <label>
            <strong>Ce fichier nécessite un mot de passe pour être téléchargé :</strong>
            <input type="password" size="15" name="password" required> 
        </label> 
        <input type="hidden" name="id" value="${file_id}"> 
        <input type="submit" value="Valider" class="Submit">
        ` + (req.query.password && doc.password !== req.query.password ? '<span class="error">Mot de passe invalide, veuillez réessayer</span>' : '') + `
    </p>
    </form>` : 
    `<p>Si le téléchargement ne commence pas automatiquement dans 5 secondes, <a href="${get_url(file_id)}&auto=1">suivez ce lien</a></p>`
    ) + `
        <div style="margin-top: 2rem"><i>Note :</i>
         <br>
         Le nom de fichier que vous proposera votre navigateur au téléchargement peut être différent du vrai nom du fichier.
        </div>
    </div>
    </body>
    </html>
        `)
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
