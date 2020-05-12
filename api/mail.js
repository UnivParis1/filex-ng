const _ = require('lodash')
const nodemailer = require('nodemailer')
const helpers = require('./helpers')
const conf = require('../conf')

const get_url = (file_id) => `https://${conf.our_vhost}/get?id=${file_id}`

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

exports.notify_uploader = (doc) => {
    const subject = `Système de transfert de fichier : ${doc.filename}`
    const text = `Vous venez de déposer le fichier : ${doc.filename}

Ce fichier sera disponible jusqu'au : ${helpers.format_date(doc.expireAt)}

Pour qu'un utilisateur télécharge votre fichier, envoyez lui cette adresse :

${get_url(doc._id)}


Information sur le fichier déposé :

Nom : ${doc.filename}
Taille : ${helpers.formatBytes(doc.size)}
Déposé le : ${helpers.format_date(doc.uploadTimestamp)}
Disponible jusqu'au : ${helpers.format_date(doc.expireAt)}

Options :

- Recevoir un avis de réception à chaque téléchargement : ${doc.download_ack ? "oui" : "non"}
- Recevoir un récapitulatif des téléchargement lorsque le fichier aura expiré : ${doc.summary ? "oui" : "non"}

Merci d'avoir utilisé le service d'échange de fichier.
`
    return send({ to: doc.uploader.mail, subject, text })
}
