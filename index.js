#!/usr/bin/env nodejs

const express = require('express')
const session = require('express-session');
const conf = require('./conf')
const db = require('./api/db')
const shib = require('./api/shib')
const api = require('./api/api')
const helpers = require('./api/helpers')
const various = require('./api/various')
const service_reload = require('./api/service_reload')
const html_template = require('./api/html_template')


const app = express()

const get_session = session({
    secret: conf.session.secret, resave: false, saveUninitialized: false, 
    cookie: { maxAge: helpers.minutes_to_ms(5) },
})
const require_session = (req, res, next) => {
    if (req.session.user) {
        next()
    } else {
        res.status(401).json({ ok: false, err: "need relog" })
    }
}
const _is_trusted = (req) => {
    const bearer = ((req.headers.authorization || '').match(/^Bearer (.*)/) || [])[1]
    if (bearer && conf.trusted.bearer_tokens.includes(bearer)) {
        return true;
    }
    const ip = conf.request_to_ip(req);
    if (conf.trusted.IPs.includes(ip)) {
        return true;
    }
    if (bearer) console.info(bearer + " is not in trusted.bearer_tokens for trusted upload")
    console.info(ip + " is not in trusted.IPs for trusted upload")
    return false;
}
const require_trusted = (req, res, next) => {
    if (_is_trusted(req)) {
        next();
    } else {
        res.status(403).json({ ok: false, err: "no valid 'Authorization Bearer' or IP not authorized (see conf.trusted)" })
    }
}
const require_admin = async (req, res, next) => {
    try {
        if (await various.is_logged_user_admin(req)) {
            next();
            return;
        }
    } catch (e) {}
    
    const err = (await db.get_exemptions()).length === 0 ? "veuillez créer un admin avec le shell mongo : db.exemptions.insertOne({ _id: '" + req.session.user.eppn + "', admin: true })" : "reservé aux admins"
    res.status(401).json({ ok: false, err })
}

app.use('/user', get_session, shib.may_create_session, require_session)
app.put('/user/upload', api.handle_upload)
app.post('/user/upload', api.handle_upload)
app.get('/user/info', api.user_info)
app.get('/user/files', api.user_files)
app.get('/user/file/:id', api.user_file)
app.delete('/user/file/:id', api.delete_user_file)
app.post('/user/file/:id', api.modify_user_file)

app.use('/trusted', require_trusted)
app.put('/trusted/upload', api.handle_trusted_upload)
app.post('/trusted/upload', api.handle_trusted_upload)

app.get('/get', api.handle_download) 
  
app.get([/^\/$/, '/manage', '/manage-file'], get_session, shib.may_create_session, shib.ensure_connected, html_template.static)

app.use('/exemptions', get_session, shib.may_create_session, require_admin)
app.get('/exemptions', api.get_exemptions)
app.delete('/exemptions/:userid', api.delete_exemption)
app.put('/exemptions/:userid', api.set_exemption)

app.use('/admin', get_session, shib.may_create_session, shib.ensure_connected, require_admin)
app.get('/admin', html_template.static)

app.use("/node_modules", express.static(__dirname + '/node_modules'))
app.use(express.static(__dirname + '/app'))

app.get('/journal', (_req, res) => res.json({ ok: true }))

const server = app.listen(conf.port, service_reload.may_write_PIDFile)
service_reload.may_handle_reload(server)

various.remove_expired()
setInterval(various.remove_expired, helpers.minutes_to_ms(5))
