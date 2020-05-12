const fs = require('fs')
const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const mail = require('./mail');
const helpers = require('./helpers');

const get_url = (file_id) => `https://${conf.our_vhost}/get?id=${file_id}`

exports.handle_upload = (req, res) => {
    if (req.query.daykeep > 45) {
        throw "invalid daykeep";
    }
    const file_id = db.new_id()
    const file = conf.upload_dir + '/' + file_id
    const out = fs.createWriteStream(file)
    req.pipe(out)
    let ok = false
    req.on('end', () => ok = true)
    out.on('close', async () => {
        console.log('out close')
        if (ok) {
            console.log('success !')
            const size = (await helpers.fs_stat(file)).size
            let doc = { 
                _id: file_id, 
                size, 
                uploadTimestamp: new Date(),
                expireAt: helpers.addDays(new Date(), req.query.daykeep),
                uploader: req.session.user,
                ..._.pick(req.query, 'filename', 'type', 'download_ack', 'summary', 'password'),
            }
            await (await db.collection('uploads')).insertOne(doc)
            mail.notify_uploader(doc)
            res.json({ ok: ok, get_url: get_url(file_id) })    
        }
    })
    req.on('aborted', () => console.error("aborted"))
    req.on('error', () => console.error("error"))
    req.on('close', async () => {
        console.log("error occurred, req close")
        out.destroy(); // need to be done to avoid leaks
        if (!ok) {
            fs.unlink(file, _ => {})
        }
        res.json({ ok: ok })
    })
}

exports.handle_download = async (req, res) => {
    const file_id = req.query.id
    if (!file_id) {
        console.error("missing id parameter")
        res.redirect("/upload/")
    } else if (!file_id.match(/^\w+$/)) {
        console.error("invalid id")
        res.redirect("/upload/")
    } else {
        const doc = await db.get(await db.collection('uploads'), file_id)
        if (doc.password ? doc.password === req.query.password : req.query.auto) {
            _.each({
                "Content-Type": doc.type,
                'Content-Disposition': "attachment; filename=" + doc.filename,
                'Content-transfert-encoding': "binary",
                'Content-Length': doc.size,
            }, (v, k) => res.setHeader(k, v))
            fs.createReadStream(conf.upload_dir + '/' + file_id).pipe(res)    
        } else {
            res.set('Content-Type', 'text/html');
            const password_form = 

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
        <link href="../filex.css" type="text/css" rel="stylesheet">
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
    }
}