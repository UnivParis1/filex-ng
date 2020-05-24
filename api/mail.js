const _ = require('lodash')
const nodemailer = require('nodemailer')
const helpers = require('./helpers')
const conf = require('../conf')
const get_url = require('./html_template').get_url

const mailTransporter = nodemailer.createTransport(conf.mail.transport)

// sendMail does not return a promise, it will be done in background. We simply log errors
// params example:
// { from: 'xxx <xxx@xxx>', to: 'foo@bar, xxx@boo', subject: 'xxx', text: '...', html: '...' }
const send = (params) => {
    params = _.assign({ from: conf.mail.from }, params)
    if (conf.mail.intercept) {
        const cc = (params.cc || '').toString()
        params.subject = '[would be sent to ' + params.to + (cc ? " Cc " + cc : '') + '] ' + params.subject
        params.to = conf.mail.intercept
        delete params.cc
    }
    mailTransporter.sendMail(params, (error, info) => {
        if (error) {
            console.log(error)
        } else {
            console.log('Mail sent: ', info)
        }
    })
}

const doc_info = (doc) => (
`Nom : ${doc.filename}
Taille : ${helpers.formatBytes(doc.size)}
Déposé le : ${helpers.format_date(doc.uploadTimestamp)}
Disponible jusqu'au : ${helpers.format_date(doc.expireAt)}`
)

exports.notify_on_upload = (doc) => {
    const subject = `Système de transfert de fichier : ${doc.filename} déposé`
    const text = `Vous venez de déposer le fichier : ${doc.filename}

Ce fichier sera disponible jusqu'au : ${helpers.format_date(doc.expireAt)}

Pour qu'un utilisateur télécharge votre fichier, envoyez lui cette adresse :

${get_url(doc._id)}


Information sur le fichier déposé :

${doc_info(doc)}

Options :

- Recevoir un avis de réception à chaque téléchargement : ${doc.download_ack ? "oui" : "non"}
- Recevoir un récapitulatif des téléchargement lorsque le fichier aura expiré : ${doc.summary ? "oui" : "non"}

Merci d'avoir utilisé le service d'échange de fichier.
`
    send({ to: doc.uploader.mail, subject, text })
}

exports.notify_on_download = async (req, doc) => {
    const client_ip = conf.request_to_ip(req)
    const client_host = await helpers.dns_reverse(client_ip).catch(_ => "")
    const subject = `Système de transfert de fichier : ${doc.filename} téléchargé`
    const text = `Le fichier "${doc.filename}" déposé le ${helpers.format_date(doc.uploadTimestamp)} a été téléchargé.

Pour informations :

Adresse de téléchargement : ${client_ip} ${client_host}

${doc_info(doc)}

Merci d'avoir utilisé le service d'échange de fichier.
`
    send({ to: doc.uploader.mail, subject, text })
}

exports.notify_on_delete = (doc, downloads) => {
    const subject = `Système de transfert de fichier : ${doc.filename} supprimé`
    const downloads_txt = downloads.map(download => (
        `- ${download.ip} le ${helpers.format_date(download.timestamp)}\n`
    )).join('')
    const text = `Votre fichier "${doc.filename}" déposé le ${helpers.format_date(doc.uploadTimestamp)} a été supprimé.

Nombre de téléchargements : ${downloads.length}

` + (downloads_txt ? `Téléchargé par :
${downloads_txt}

` : '') + `Pour informations :

${doc_info(doc)}


Merci d'avoir utilisé le service d'échange de fichier.
`
    send({ to: doc.uploader.mail, subject, text })
}
