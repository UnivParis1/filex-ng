#!/usr/bin/env nodejs

const express = require('express')
const session = require('express-session');
const conf = require('./conf')
const shib = require('./api/shib')
const api = require('./api/api')
const helpers = require('./api/helpers')


const app = express()

const require_session = session({
    secret: conf.session.secret, resave: false, saveUninitialized: false, 
    cookie: { maxAge: helpers.minutes_to_ms(5) },
})

app.use('/user', require_session)
app.put('/user/upload', api.handle_upload)
app.post('/user/upload', api.handle_upload)

app.get('/get', api.handle_download) 
  
app.use('/upload', require_session, shib.ensure_connected)
app.use("/node_modules", express.static(__dirname + '/node_modules'))
app.use(express.static(__dirname + '/app'))

// fallback
app.all("/", (_, res) => res.redirect("/upload"))

app.listen(conf.port)

api.remove_expired()
setInterval(api.remove_expired, helpers.minutes_to_ms(5))
