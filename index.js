#!/usr/bin/env nodejs

const express = require('express')
const session = require('express-session');
const conf = require('./conf')
const shib = require('./api/shib')
const api = require('./api/api')
const helpers = require('./api/helpers')


const app = express()

const get_session = session({
    secret: conf.session.secret, resave: false, saveUninitialized: false, 
    cookie: { maxAge: helpers.minutes_to_ms(5) },
})
const require_session = (req, res, next) => {
    if (!req.session.user) throw "need relog"
    next()
}

app.use('/user', get_session, require_session)
app.put('/user/upload', api.handle_upload)
app.post('/user/upload', api.handle_upload)
app.get('/user/info', api.user_info)
app.get('/user/files', api.user_files)
app.get('/user/file/:id', api.user_file)

app.get('/get', api.handle_download) 
  
app.use([/^\/$/, '/manage.html', '/manage-file.html'], get_session, shib.ensure_connected)

app.use("/node_modules", express.static(__dirname + '/node_modules'))
app.use(express.static(__dirname + '/app'))

app.listen(conf.port)

api.remove_expired()
setInterval(api.remove_expired, helpers.minutes_to_ms(5))
