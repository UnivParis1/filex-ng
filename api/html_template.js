const helpers = require('./helpers')
const conf = require('../conf')


const get_url = exports.get_url = (file_id) => `https://${conf.our_vhost}/get?id=${file_id}`

const beginning = (more_meta) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${more_meta}
  <title>FileX</title>
  <link href="lib.css" type="text/css" rel="stylesheet">
  <link href="filex.css" type="text/css" rel="stylesheet">
</head>
<body>
`

const base_js_files = `
<script src="node_modules/vue/dist/vue.global.js"></script>
<script src="common.js"></script>
`

const end = `
</body>
</html>`

exports.static = async (req, res) => {
    const template_filename = __dirname + '/../app' + (req.path === '/' ? '/index.html' : req.path + ".html")
    let html = await helpers.fsP.readFile(template_filename)
    res.set('Content-Type', 'text/html');
    res.end(beginning('') + base_js_files + html + end)
}

exports.get__before_download = async (query, doc, res) => {
    res.set('Content-Type', 'text/html');

    res.end(beginning(doc.password ? '' :
    `<meta http-equiv="refresh" content="5; URL=${get_url(doc._id)}&auto=1">`
) + `
<div id=bandeau-anonyme-title>Envoi de fichiers avec Filex</div>
<div id="main">
    <p>Vous avez demandé le fichier <b>${doc.filename || '<i>sans nom</i>'}</b></p>
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
    <input type="hidden" name="id" value="${doc._id}"> 
    <input type="submit" value="Valider" class="Submit">
    ` + (query.password && doc.password !== query.password ? '<span class="error">Mot de passe invalide, veuillez réessayer</span>' : '') + `
</p>
</form>` : 
`<p>Si le téléchargement ne commence pas automatiquement dans 5 secondes, <a href="${get_url(doc._id)}&auto=1">suivez ce lien</a></p>`
) + `
    <div style="margin-top: 2rem"><i>Note :</i>
     <br>
     Le nom de fichier que vous proposera votre navigateur au téléchargement peut être différent du vrai nom du fichier.
    </div>
</div>` + end)
}