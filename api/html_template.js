const helpers = require('./helpers')

const beginning = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileX</title>
  <link href="lib.css" type="text/css" rel="stylesheet">
  <link href="filex.css" type="text/css" rel="stylesheet">
</head>
<body>
<script> window.prolongation_ENT_args = { current: "CFilex", layout_url: "/EsupUserApps/layout" }; </script>
<script type="text/javascript" src="https://ent.univ-paris1.fr/ProlongationENT/loader.js"></script>

<script src="node_modules/vue/dist/vue.js"></script>
<script src="common.js"></script>
`

const end = `
</body>
</html>`

exports.static = async (req, res) => {
    const template_filename = __dirname + '/../app' + (req.path === '/' ? '/index.html' : req.path + ".html")
    let html = await helpers.fs_readFile(template_filename)
    res.set('Content-Type', 'text/html');
    res.end(beginning + html + end)
}
